import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthProviderView } from "../src/auth/AuthProvider"
import type { AuthProvider, AuthSession } from "../src/auth/types"
import { RequireAuth } from "../src/router/guards"

const session: AuthSession = {
  user: {
    id: "u1",
    username: "admin",
    nickname: "管理员",
    email: null,
    telephone: null,
  },
  accessToken: "at",
}

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function createMockProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    login: vi.fn<AuthProvider["login"]>(),
    sendOtp: vi.fn<AuthProvider["sendOtp"]>(),
    logout: vi.fn<AuthProvider["logout"]>(),
    refresh: vi.fn<AuthProvider["refresh"]>(),
    getSession: vi.fn<AuthProvider["getSession"]>(),
    ...overrides,
  }
}

function renderRequireAuth(provider: AuthProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProviderView provider={provider}>
        <MemoryRouter initialEntries={["/protected"]}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/protected" element={<div>受保护内容</div>} />
            </Route>
            <Route path="/login" element={<div>登录页</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProviderView>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  // vitest 未开 globals，RTL 不会自动注册 cleanup，需手动清理（否则上一用例的 DOM 会残留）
  cleanup()
  vi.unstubAllGlobals()
})

describe("RequireAuth", () => {
  it("无会话：重定向到 /login 且不渲染受保护内容", async () => {
    renderRequireAuth(
      createMockProvider({ getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(null) }),
    )

    await waitFor(() => {
      expect(screen.getByText("登录页")).toBeInTheDocument()
    })
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument()
  })

  it("无会话：会话判定只走 getSession，不请求 /auth/me", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderRequireAuth(
      createMockProvider({ getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(null) }),
    )

    await waitFor(() => {
      expect(screen.getByText("登录页")).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("有会话：渲染受保护内容", async () => {
    // getSession 成功后 queryFn 会继续请求 /auth/me 取 navTree——stub fetch 返回 me 响应
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ user: session.user, roles: [], navTree: [], permissionCodes: [] }),
    )
    vi.stubGlobal("fetch", fetchMock)
    renderRequireAuth(
      createMockProvider({ getSession: vi.fn<AuthProvider["getSession"]>().mockResolvedValue(session) }),
    )

    await waitFor(() => {
      expect(screen.getByText("受保护内容")).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("会话解析中：展示加载态", () => {
    renderRequireAuth(
      createMockProvider({
        // 永不 resolve：模拟会话解析中
        getSession: vi
          .fn<AuthProvider["getSession"]>()
          .mockImplementation(() => new Promise<AuthSession | null>(() => undefined)),
      }),
    )

    expect(screen.getByText("加载中…")).toBeInTheDocument()
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument()
  })
})
