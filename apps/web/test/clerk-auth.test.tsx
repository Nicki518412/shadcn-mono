import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../src/api/client"
import { ClerkAuthProvider, ClerkSessionAdapter } from "../src/auth/ClerkAuthProvider"
import { clearTokens, getAccessToken } from "../src/api/session"

// @clerk/clerk-react 全量 mock：会话状态由 clerkState 驱动（改值 + rerender 模拟会话变化）
const clerkState = vi.hoisted(() => ({
  isSignedIn: true,
  token: "clerk-token",
  signOut: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: clerkState.isSignedIn,
    getToken: () => Promise.resolve(clerkState.token),
    signOut: clerkState.signOut,
  }),
  useUser: () => ({
    user: clerkState.isSignedIn
      ? {
          id: "clerk_user_1",
          username: "john",
          firstName: "John",
          lastName: "Doe",
          primaryEmailAddress: { emailAddress: "john@example.com" },
          primaryPhoneNumber: null,
        }
      : null,
  }),
}))

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, data, message: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ code: String(status), data: null, message }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** 取第 index 次 fetch 调用（calls 索引在 noUncheckedIndexedAccess 下可为 undefined，先判空） */
function fetchCall(index: number): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`fetch 调用 #${String(index)} 未发生`)
  return { url: call[0], init: call[1] ?? {} }
}

function renderAdapter() {
  const view = render(
    <ClerkSessionAdapter>
      <div>app</div>
    </ClerkSessionAdapter>,
  )
  return {
    rerender: () => {
      view.rerender(
        <ClerkSessionAdapter>
          <div>app</div>
        </ClerkSessionAdapter>,
      )
    },
  }
}

beforeEach(() => {
  clerkState.isSignedIn = true
  clerkState.token = "clerk-token"
  clerkState.signOut.mockClear()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  clearTokens()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ClerkSessionAdapter 桥接", () => {
  it("会话就绪：token 同步进 session.ts，getSession 返回映射用户", async () => {
    renderAdapter()

    await waitFor(() => {
      expect(getAccessToken()).toBe("clerk-token")
    })
    const provider = new ClerkAuthProvider()
    await expect(provider.getSession()).resolves.toEqual({
      user: {
        id: "clerk_user_1",
        username: "john",
        nickname: "John Doe",
        email: "john@example.com",
        telephone: null,
      },
      accessToken: "clerk-token",
    })
  })

  it("会话结束（signOut 触发）：token 清空、getSession 返回 null", async () => {
    const { rerender } = renderAdapter()
    await waitFor(() => {
      expect(getAccessToken()).toBe("clerk-token")
    })

    act(() => {
      clerkState.isSignedIn = false
    })
    rerender()

    await waitFor(() => {
      expect(getAccessToken()).toBeNull()
    })
    await expect(new ClerkAuthProvider().getSession()).resolves.toBeNull()
  })

  it("login/sendOtp 抛错（Clerk 模式由 <SignIn/> 处理）", () => {
    const provider = new ClerkAuthProvider()
    // 同步 throw（非 async 方法）：调用即抛，契约上 clerk 模式无人调用
    expect(() => provider.login()).toThrow(/SignIn/)
    expect(() => provider.sendOtp()).toThrow(/Clerk/)
  })

  it("logout：调用 Clerk signOut 并清理本地 token 与桥状态", async () => {
    renderAdapter()
    await waitFor(() => {
      expect(getAccessToken()).toBe("clerk-token")
    })

    const provider = new ClerkAuthProvider()
    await provider.logout()

    expect(clerkState.signOut).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
    await expect(provider.getSession()).resolves.toBeNull()
  })

  it("refresh：重取 token 同步并返回当前会话", async () => {
    renderAdapter()
    await waitFor(() => {
      expect(getAccessToken()).toBe("clerk-token")
    })
    clerkState.token = "clerk-token-2"

    const provider = new ClerkAuthProvider()
    const session = await provider.refresh()

    expect(getAccessToken()).toBe("clerk-token-2")
    expect(session.user.id).toBe("clerk_user_1")
    expect(session.accessToken).toBe("clerk-token-2")
  })

  it("api 401：经注册的 Clerk 刷新器重取 token 并重试一次", async () => {
    renderAdapter()
    await waitFor(() => {
      expect(getAccessToken()).toBe("clerk-token")
    })
    clerkState.token = "clerk-token-2"
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "Clerk 会话无效"))
      .mockResolvedValueOnce(okResponse({ ok: true }))

    const data = await api<{ ok: boolean }>("/auth/me")

    expect(data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const retryHeaders = new Headers(fetchCall(1).init.headers)
    expect(retryHeaders.get("authorization")).toBe("Bearer clerk-token-2")
    expect(getAccessToken()).toBe("clerk-token-2")
  })

  it("api 401 且刷新器返回 null（无会话）：不重试，抛出后端错误", async () => {
    renderAdapter()
    await waitFor(() => {
      expect(getAccessToken()).toBe("clerk-token")
    })
    clerkState.token = null as unknown as string
    fetchMock.mockResolvedValueOnce(errorResponse(401, "Clerk 会话无效"))

    await expect(api<{ ok: boolean }>("/auth/me")).rejects.toThrow("Clerk 会话无效")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
