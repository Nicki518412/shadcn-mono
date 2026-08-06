import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { components } from "../src/api/schema"
import { AuthProviderView } from "../src/auth/AuthProvider"
import type { AuthProvider } from "../src/auth/types"
import UserPage from "../src/features/system/user/page"
import { ME_QUERY_KEY } from "../src/router/guards"

const usersPageResult: components["schemas"]["UserPageResult"] = {
  list: [
    {
      id: "u1",
      username: "admin",
      nickname: "系统管理员",
      email: "admin@example.com",
      telephone: "13800138000",
      status: true,
      createdAt: "2026-08-01T02:00:00.000Z",
      roles: [{ id: "r1", name: "管理员", code: "ADMIN" }],
    },
    {
      id: "u2",
      username: "zhangsan",
      nickname: "张三",
      email: null,
      telephone: null,
      status: false,
      createdAt: "2026-08-02T02:00:00.000Z",
      roles: [],
    },
  ],
  total: 2,
}

const rolesList: components["schemas"]["RoleListItem"][] = [
  {
    id: "r1",
    name: "管理员",
    code: "ADMIN",
    description: null,
    sort: 0,
    status: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
]

const ALL_PERMISSIONS = [
  "system:user:query",
  "system:user:create",
  "system:user:update",
  "system:user:delete",
  "system:user:assign-role",
]

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

/** RequestInfo | URL → 字符串 URL（base-to-string 规则禁止 String(object)） */
function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

/** 路由式 fetch mock：/api/users 列表、POST /api/users、/api/roles/list；其余 URL 抛错防静默 */
function createFetchMock() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrlString(input)
    const method = init?.method ?? "GET"
    if (method === "POST" && url === "/api/users") {
      return Promise.resolve(okResponse(usersPageResult.list[0]))
    }
    if (url.startsWith("/api/users")) {
      return Promise.resolve(okResponse(usersPageResult))
    }
    if (url.startsWith("/api/roles/list")) {
      return Promise.resolve(okResponse(rolesList))
    }
    throw new Error(`unexpected fetch: ${method} ${url}`)
  })
}

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
 * 预填充 me 缓存（Permission 组件依赖）：permissionCodes 全量授权 → 操作按钮均渲染；
 * staleTime: Infinity 阻止 useMeQuery 后台 refetch 覆盖缓存（fetch mock 不含 /auth/me）
 */
function renderUserPage(fetchMock: ReturnType<typeof createFetchMock>) {
  vi.stubGlobal("fetch", fetchMock)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData<components["schemas"]["MeResponse"]>(ME_QUERY_KEY, {
    user: { id: "u1", username: "admin", nickname: "系统管理员", email: null, telephone: null },
    roles: [{ id: "r1", name: "管理员", code: "ADMIN" }],
    navTree: [],
    permissionCodes: ALL_PERMISSIONS,
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProviderView provider={createMockProvider()}>
        <UserPage />
      </AuthProviderView>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("UserPage", () => {
  it("渲染用户列表：用户名/状态/角色/权限门控操作按钮", async () => {
    renderUserPage(createFetchMock())

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
    expect(screen.getByText("系统管理员")).toBeInTheDocument()
    expect(screen.getByText("zhangsan")).toBeInTheDocument()
    expect(screen.getByText("启用")).toBeInTheDocument()
    expect(screen.getByText("禁用")).toBeInTheDocument()
    // 角色 Badge（管理员）；空邮箱/手机号/角色渲染占位符
    expect(screen.getByText("管理员")).toBeInTheDocument()
    expect(screen.getAllByText("-")).toHaveLength(3)
    // Permission 全量授权：新增/编辑/分配角色/删除按钮均渲染
    expect(screen.getByRole("button", { name: "新增用户" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "分配角色" })).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "删除" })).toHaveLength(2)
  })

  it("新增用户：打开 Dialog 填表提交 → POST /api/users 携带表单数据", async () => {
    const fetchMock = createFetchMock()
    renderUserPage(fetchMock)

    await waitFor(() => {
      expect(screen.getByText("admin")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole("button", { name: "新增用户" }))

    const usernameInput = await screen.findByLabelText("用户名")
    fireEvent.change(usernameInput, { target: { value: "alice" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "Passw0rd!" } })
    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "爱丽丝" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
      expect(postCall).toBeDefined()
      const rawBody = postCall?.[1]?.body
      expect(typeof rawBody).toBe("string")
      expect(JSON.parse(rawBody as string)).toEqual({
        username: "alice",
        password: "Passw0rd!",
        nickname: "爱丽丝",
      })
    })
  })
})
