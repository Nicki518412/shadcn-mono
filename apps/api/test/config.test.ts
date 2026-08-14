import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/config.js"

describe("config", () => {
  it("生产 local 模式拒绝缺失或弱 JWT_SECRET", () => {
    expect(() => loadConfig({ NODE_ENV: "production", AUTH_PROVIDER: "local" })).toThrow(/JWT_SECRET/)
    expect(() =>
      loadConfig({ NODE_ENV: "production", AUTH_PROVIDER: "local", JWT_SECRET: "too-short" }),
    ).toThrow(/JWT_SECRET/)
  })

  it("生产 local 模式拒绝已知占位密钥（compose 模板值等）", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        AUTH_PROVIDER: "local",
        JWT_SECRET: "change-me-in-prod-please-use-32-chars",
      }),
    ).toThrow(/JWT_SECRET/)
  })

  it("生产 local 模式接受至少 32 字符的随机密钥", () => {
    const cfg = loadConfig({
      NODE_ENV: "production",
      AUTH_PROVIDER: "local",
      JWT_SECRET: "0123456789abcdef0123456789abcdef",
    })
    expect(cfg.jwtSecret).toHaveLength(32)
  })
})
