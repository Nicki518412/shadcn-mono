import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { runCleanup } from "../src/lib/scheduler.js"

describe("定时清理 runCleanup", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { username: "sched_user", passwordHash: await hashPassword("Passw0rd!"), nickname: "调度测试" },
    })
    await prisma.$transaction([
      // 过期 refreshToken（已过期，无论是否吊销）
      prisma.refreshToken.create({ data: { userId: user.id, tokenHash: "sched_expired", expiresAt: new Date("2020-01-01T00:00:00Z") } }),
      // 已吊销但未过期
      prisma.refreshToken.create({ data: { userId: user.id, tokenHash: "sched_revoked", expiresAt: new Date("2099-01-01T00:00:00Z"), revokedAt: new Date() } }),
      // 有效（未吊销且未过期）——应保留
      prisma.refreshToken.create({ data: { userId: user.id, tokenHash: "sched_valid", expiresAt: new Date("2099-01-01T00:00:00Z") } }),
      // 过期 otpCode / 已消费 otpCode / 有效 otpCode
      prisma.otpCode.create({ data: { channel: "EMAIL", target: "sched@example.com", codeHash: "sched_expired_otp", expiresAt: new Date("2020-01-01T00:00:00Z") } }),
      prisma.otpCode.create({ data: { channel: "EMAIL", target: "sched@example.com", codeHash: "sched_consumed", expiresAt: new Date("2099-01-01T00:00:00Z"), consumedAt: new Date() } }),
      prisma.otpCode.create({ data: { channel: "EMAIL", target: "sched@example.com", codeHash: "sched_valid_otp", expiresAt: new Date("2099-01-01T00:00:00Z") } }),
    ])
  })

  it("删除已过期/已吊销的 refreshToken 与已过期/已消费的 otpCode，保留有效记录", async () => {
    await runCleanup()
    const tokens = await prisma.refreshToken.findMany({ where: { tokenHash: { startsWith: "sched_" } } })
    expect(tokens.map((t) => t.tokenHash)).toEqual(["sched_valid"])
    const codes = await prisma.otpCode.findMany({ where: { codeHash: { startsWith: "sched_" } } })
    expect(codes.map((c) => c.codeHash)).toEqual(["sched_valid_otp"])
  })

  it("幂等：重复执行不报错、不误删有效记录", async () => {
    await runCleanup()
    expect(await prisma.refreshToken.count({ where: { tokenHash: "sched_valid" } })).toBe(1)
    expect(await prisma.otpCode.count({ where: { codeHash: "sched_valid_otp" } })).toBe(1)
  })
})
