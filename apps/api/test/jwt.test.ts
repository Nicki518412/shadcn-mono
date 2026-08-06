import { describe, expect, it } from "vitest"
import { signAccessToken, verifyAccessToken } from "../src/lib/jwt.js"

const SECRET = "test-secret"

describe("jwt", () => {
  it("签名后可验证并返回 userId", () => {
    const token = signAccessToken("user_1", SECRET)
    expect(verifyAccessToken(token, SECRET)).toBe("user_1")
  })

  it("错误密钥返回 null", () => {
    const token = signAccessToken("user_1", SECRET)
    expect(verifyAccessToken(token, "other-secret")).toBeNull()
  })

  it("篡改 payload 返回 null", () => {
    const token = signAccessToken("user_1", SECRET)
    const parts = token.split(".")
    const now = Math.floor(Date.now() / 1000)
    const forged = Buffer.from(JSON.stringify({ sub: "user_2", exp: now + 300, iat: now })).toString("base64url")
    expect(verifyAccessToken(`${parts[0] ?? ""}.${forged}.${parts[2] ?? ""}`, SECRET)).toBeNull()
  })

  it("过期 token 返回 null（注入过去时间签名）", () => {
    const token = signAccessToken("user_1", SECRET, Date.now() - 10 * 60 * 1000)
    expect(verifyAccessToken(token, SECRET)).toBeNull()
  })

  it("垃圾输入返回 null", () => {
    expect(verifyAccessToken("", SECRET)).toBeNull()
    expect(verifyAccessToken("!!!", SECRET)).toBeNull()
    expect(verifyAccessToken("a.b", SECRET)).toBeNull()
    expect(verifyAccessToken("a.b.c", SECRET)).toBeNull()
    expect(verifyAccessToken("x.y", SECRET)).toBeNull()
  })
})
