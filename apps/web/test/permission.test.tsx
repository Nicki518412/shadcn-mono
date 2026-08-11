import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { components } from "../src/api/schema"
import { AuthProviderView } from "../src/auth/AuthProvider"
import type { AuthProvider } from "../src/auth/types"
import { Permission } from "../src/components/business/Permission"
import { usePermissionCodes } from "../src/hooks/usePermissionCodes"
import { ME_QUERY_KEY } from "../src/router/guards"

function createMockProvider(): AuthProvider {
  return {
    login: vi.fn(),
    sendOtp: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    getSession: vi.fn(),
  }
}

/**
 * 预填充 me 缓存（setQueryData 直写，不依赖 fetch）：permissionCodes 即按钮级权限码集合。
 * staleTime: Infinity：预填充后缓存永不过期，阻止 refetchOnMount 的后台 refetch 以 queryFn
 * 结果覆盖缓存（无会话时 queryFn 返回 null）——默认 staleTime:0 下测试仅靠同步断言蒙混过关
 */
function createQueryClient(permissionCodes: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData<components["schemas"]["MeResponse"]>(ME_QUERY_KEY, {
    user: { id: "u1", username: "admin", nickname: "管理员", email: null, telephone: null, avatar: null },
    roles: [],
    navTree: [],
    permissionCodes,
  })
  return queryClient
}

function renderWithPermissions(queryClient: QueryClient, ui: ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProviderView provider={createMockProvider()}>{ui}</AuthProviderView>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
})

describe("Permission", () => {
  it("权限码命中：渲染 children", () => {
    renderWithPermissions(
      createQueryClient(["system:user:add"]),
      <Permission code="system:user:add">
        <button>新增用户</button>
      </Permission>,
    )

    expect(screen.getByRole("button", { name: "新增用户" })).toBeInTheDocument()
  })

  it("权限码未命中：渲染 fallback 而非 children", () => {
    renderWithPermissions(
      createQueryClient(["system:user:add"]),
      <Permission code="system:user:delete" fallback={<span>无权限</span>}>
        <button>删除用户</button>
      </Permission>,
    )

    expect(screen.getByText("无权限")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "删除用户" })).not.toBeInTheDocument()
  })

  it("权限码未命中且未提供 fallback：不渲染任何内容", () => {
    renderWithPermissions(
      createQueryClient(["system:user:add"]),
      <Permission code="system:user:delete">
        <button>删除用户</button>
      </Permission>,
    )

    expect(screen.queryByRole("button", { name: "删除用户" })).not.toBeInTheDocument()
  })

  it("usePermissionCodes：返回 me 缓存中的权限码集合（Harness 断言）", () => {
    function Harness() {
      const codes = usePermissionCodes()
      return <div data-testid="codes">{[...codes].sort().join(",")}</div>
    }

    renderWithPermissions(createQueryClient(["system:role:list", "system:user:add"]), <Harness />)

    expect(screen.getByTestId("codes")).toHaveTextContent("system:role:list,system:user:add")
  })

  it("未预填充 me 缓存（守卫 pending 期）：视为无权限，渲染 fallback", async () => {
    // 无缓存时 useMeQuery 处于 pending，data 为 undefined —— ?? [] 兜底返回空集
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithPermissions(
      queryClient,
      <Permission code="system:user:add" fallback={<span>无权限</span>}>
        <button>新增用户</button>
      </Permission>,
    )

    await waitFor(() => {
      expect(screen.getByText("无权限")).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "新增用户" })).not.toBeInTheDocument()
  })
})
