import { describe, expect, it } from "vitest"
import { redactJson } from "../src/lib/redact.js"

describe("redactJson", () => {
  it("顶层与嵌套的 password/token/secret/code 键值脱敏为 ***", () => {
    const text = JSON.stringify({
      username: "admin",
      password: "Secret123",
      refreshToken: "rt",
      items: [{ code: "123456" }, { nickname: "昵称", clientSecret: "s" }],
      description: "保留",
    })
    const redacted = JSON.parse(redactJson(text)) as Record<string, unknown>
    expect(redacted.password).toBe("***")
    expect(redacted.refreshToken).toBe("***")
    expect((redacted.items as { code: string }[])[0]?.code).toBe("***")
    expect((redacted.items as { clientSecret: string }[])[1]?.clientSecret).toBe("***")
    expect(redacted.username).toBe("admin")
    expect(redacted.description).toBe("保留")
  })

  it("非 JSON 文本原样返回", () => {
    expect(redactJson("plain text")).toBe("plain text")
  })
})
