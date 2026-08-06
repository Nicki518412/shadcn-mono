import { z } from "@hono/zod-openapi"
import type { User } from "@repo/db"

// 注：zod-to-openapi v7 的 refId 走位置参数 openapi("RefId")（v6 的 { refId } 对象形式已不再支持）
/** 公开用户信息（登录/me 等响应共用，Task 14 openapi-typescript 生成类型） */
export const publicUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    nickname: z.string(),
    email: z.string().nullable(),
    telephone: z.string().nullable(),
  })
  .openapi("UserPublic")

/** 双 token 对（登录/刷新响应共用） */
export const tokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .openapi("TokenPair")

/** 统一错误体（全部错误响应共享组件） */
export const errorBodySchema = z
  .object({
    code: z.string(),
    message: z.string(),
    data: z.null(),
  })
  .openapi("ErrorBody")

/** 登录响应 data（tokenPair + user） */
export const loginResponseSchema = tokenPairSchema.extend({ user: publicUserSchema }).openapi("LoginResponse")

export type PublicUser = z.infer<typeof publicUserSchema>
export type TokenPair = z.infer<typeof tokenPairSchema>

/** 选 Prisma User 子集（字段均为非可选，避免 exactOptionalPropertyTypes 下 undefined 不可赋问题） */
export function toPublicUser(user: Pick<User, "id" | "username" | "nickname" | "email" | "telephone">): PublicUser {
  return { id: user.id, username: user.username, nickname: user.nickname, email: user.email, telephone: user.telephone }
}
