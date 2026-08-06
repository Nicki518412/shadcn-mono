import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "../src/lib/password.js"

describe("password", () => {
  it("hash 后可验证，格式为 scrypt$salt$hash", async () => {
    const stored = await hashPassword("Passw0rd!")
    expect(stored.split("$")).toHaveLength(3)
    expect(stored.split("$")[0]).toBe("scrypt")
    await expect(verifyPassword("Passw0rd!", stored)).resolves.toBe(true)
  })

  it("错误密码返回 false", async () => {
    const stored = await hashPassword("Passw0rd!")
    await expect(verifyPassword("Wrongpass", stored)).resolves.toBe(false)
  })

  it("畸形串返回 false", async () => {
    await expect(verifyPassword("Passw0rd!", "abc")).resolves.toBe(false)
    await expect(verifyPassword("Passw0rd!", "scrypt$x")).resolves.toBe(false)
    await expect(verifyPassword("Passw0rd!", "$a$b")).resolves.toBe(false)
  })
})
