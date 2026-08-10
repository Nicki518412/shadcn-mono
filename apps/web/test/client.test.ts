import { afterEach, describe, expect, it, vi } from "vitest"

import { api, ApiError, apiErrorMessage } from "../src/api/client"

// i18n 由 test/setup.ts 固定为 zh（localStorage.language = "zh"）

describe("apiErrorMessage", () => {
  it("已知错误码：经 errors 命名空间映射为当前语言（zh）文案，替代后端 message", () => {
    expect(apiErrorMessage(new ApiError("后端中文兜底", "LOGIN_FAILED"))).toBe("用户名或密码错误")
    expect(apiErrorMessage(new ApiError("用户名已存在", "USERNAME_TAKEN"))).toBe("用户名已存在")
  })

  it("未知错误码：回退后端 message", () => {
    expect(apiErrorMessage(new ApiError("服务端未知错误", "SOME_UNKNOWN_CODE"))).toBe("服务端未知错误")
  })

  it("无错误码的 ApiError 与普通 Error：直接用 message", () => {
    expect(apiErrorMessage(new ApiError("普通业务错误"))).toBe("普通业务错误")
    expect(apiErrorMessage(new Error("网络请求失败"))).toBe("网络请求失败")
  })

  it("非 Error 输入：兜底通用文案", () => {
    expect(apiErrorMessage("boom")).toBe("请求失败")
    expect(apiErrorMessage(undefined)).toBe("请求失败")
  })
})

describe("api()", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("非 2xx 响应：抛 ApiError 并携带后端错误码", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ code: "USERNAME_TAKEN", message: "用户名已存在", data: null }),
      }),
    )
    const err = (await api<never>("/users").catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe("USERNAME_TAKEN")
    expect(err.message).toBe("用户名已存在")
  })

  it("非 JSON 错误响应：ApiError 无 code，message 为状态码兜底", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      }),
    )
    const err = (await api<never>("/users").catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBeUndefined()
    expect(err.message).toBe("请求失败(500)")
  })
})
