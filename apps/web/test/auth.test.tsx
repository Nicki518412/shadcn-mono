import { beforeEach, describe, expect, it, vi } from "vitest"
import { JwtAuthProvider } from "../src/auth/JwtAuthProvider"
import { api } from "../src/api/client"
import { clearTokens, getAccessToken, setAccessToken, setRefreshToken } from "../src/api/session"

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

/** 取第 index 次 fetch 调用（url + init） */
function fetchCall(index: number): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`fetch 调用 #${String(index)} 未发生`)
  return { url: call[0], init: call[1] ?? {} }
}

/** 解析第 index 次 fetch 调用的 JSON 请求体 */
function requestBody(index: number): unknown {
  const { init } = fetchCall(index)
  if (typeof init.body !== "string") throw new Error(`fetch 调用 #${String(index)} 的 body 非字符串`)
  return JSON.parse(init.body)
}

const user = { id: "u1", username: "a", nickname: "A", email: null, telephone: null }

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  localStorage.clear()
  clearTokens()
})

describe("JwtAuthProvider", () => {
  it("密码登录：POST /auth/login 请求体正确，双 token 落位", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ user, accessToken: "at", refreshToken: "rt" }))

    const session = await new JwtAuthProvider().login({
      kind: "password",
      username: "a",
      password: "Passw0rd!",
    })

    expect(session).toEqual({ user, accessToken: "at" })
    expect(getAccessToken()).toBe("at")
    expect(localStorage.getItem("refreshToken")).toBe("rt")
    const loginCall = fetchCall(0)
    expect(loginCall.url).toMatch(/\/auth\/login$/)
    expect(loginCall.init.method).toBe("POST")
    expect(requestBody(0)).toEqual({ username: "a", password: "Passw0rd!" })
  })

  it("OTP 登录：POST /auth/otp/login 请求体正确", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ user, accessToken: "at-otp", refreshToken: "rt-otp" }))

    const session = await new JwtAuthProvider().login({
      kind: "otp",
      channel: "email",
      target: "a@example.com",
      code: "123456",
    })

    expect(session.accessToken).toBe("at-otp")
    expect(localStorage.getItem("refreshToken")).toBe("rt-otp")
    const call = fetchCall(0)
    expect(call.url).toMatch(/\/auth\/otp\/login$/)
    expect(requestBody(0)).toEqual({ channel: "email", target: "a@example.com", code: "123456" })
  })

  it("401 时自动 refresh 并用新 token 重试一次", async () => {
    setAccessToken("expired-at")
    setRefreshToken("rt")
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "登录已过期"))
      .mockResolvedValueOnce(okResponse({ accessToken: "at2", refreshToken: "rt2" }))
      .mockResolvedValueOnce(okResponse({ ok: true }))

    const data = await api<{ ok: boolean }>("/users")

    expect(data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const refreshCall = fetchCall(1)
    expect(refreshCall.url).toMatch(/\/auth\/refresh$/)
    expect(requestBody(1)).toEqual({ refreshToken: "rt" })
    const retryHeaders = new Headers(fetchCall(2).init.headers)
    expect(retryHeaders.get("authorization")).toBe("Bearer at2")
    expect(getAccessToken()).toBe("at2")
    expect(localStorage.getItem("refreshToken")).toBe("rt2")
  })

  it("并发 401 时 refresh 单飞只发一次", async () => {
    setAccessToken("expired-at")
    setRefreshToken("rt")
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "登录已过期"))
      .mockResolvedValueOnce(errorResponse(401, "登录已过期"))
      .mockResolvedValueOnce(okResponse({ accessToken: "at2", refreshToken: "rt2" }))
      .mockResolvedValueOnce(okResponse({ ok: 1 }))
      .mockResolvedValueOnce(okResponse({ ok: 2 }))

    const [r1, r2] = await Promise.all([api<{ ok: number }>("/a"), api<{ ok: number }>("/b")])

    expect([r1.ok, r2.ok].sort()).toEqual([1, 2])
    expect(fetchMock).toHaveBeenCalledTimes(5)
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url.includes("/auth/refresh"))
    expect(refreshCalls).toHaveLength(1)
  })

  it("refresh 失败：抛出错误并清空 tokens", async () => {
    setAccessToken("expired-at")
    setRefreshToken("rt")
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "登录已过期"))
      .mockResolvedValueOnce(errorResponse(401, "refresh 无效"))

    await expect(api<{ ok: boolean }>("/users")).rejects.toThrow("refresh 无效")
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem("refreshToken")).toBeNull()
  })
})
