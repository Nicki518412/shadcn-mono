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
