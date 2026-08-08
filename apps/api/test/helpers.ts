import { prisma } from "@repo/db"
import { hashPassword } from "@repo/db"
import { getDevOtpCode } from "../src/lib/otp-sender.js"

export async function createTestUser(opts: {
  username: string
  password: string
  email?: string
  telephone?: string
}): Promise<void> {
  await prisma.user.create({
    data: {
      username: opts.username,
      passwordHash: await hashPassword(opts.password),
      nickname: opts.username,
      // exactOptionalPropertyTypes：undefined 不可赋给 string|null，显式置空
      email: opts.email ?? null,
      telephone: opts.telephone ?? null,
    },
  })
}

/** 测试用：读取 DevOtpSender 的进程内验证码，不向数据库写入明文。 */
export function captureDevOtpCode(target: string, channel: "email" | "telephone"): string {
  const code = getDevOtpCode(channel, target)
  if (!code) throw new Error(`未找到未消费验证码: ${target}`)
  return code
}
