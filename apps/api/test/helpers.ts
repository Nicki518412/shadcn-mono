import { prisma } from "@repo/db"
import { hashPassword } from "../src/lib/password.js"

export async function createTestUser(opts: {
  username: string
  password: string
  email?: string
}): Promise<void> {
  await prisma.user.create({
    data: {
      username: opts.username,
      passwordHash: await hashPassword(opts.password),
      nickname: opts.username,
      // exactOptionalPropertyTypes：undefined 不可赋给 string|null，显式置空
      email: opts.email ?? null,
    },
  })
}

/** 测试用：读最新未消费验证码（DevOtpSender 写 devPlainCode 明文通道） */
export async function captureCodeFromDb(target: string): Promise<string> {
  const record = await prisma.otpCode.findFirst({
    where: { target, consumedAt: null },
    orderBy: { createdAt: "desc" },
  })
  const code = record?.devPlainCode
  if (!code) throw new Error(`未找到未消费验证码: ${target}`)
  return code
}
