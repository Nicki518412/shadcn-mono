import { createHash, randomBytes } from "node:crypto"
import { prisma } from "@repo/db"
import { signAccessToken } from "./jwt.js"

const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000

export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex")
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/** 签发上下文元信息（会话管理展示用；取不到传 null，与 request-log 的 requestIp/requestUserAgent 同源） */
export interface TokenMeta {
  ip: string | null
  userAgent: string | null
}

export async function issueTokenPair(userId: string, jwtSecret: string, meta?: TokenMeta): Promise<TokenPair> {
  const refreshToken = generateRefreshToken()
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      // exactOptionalPropertyTypes：可选参数 undefined 不可显式赋值，统一转 null
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  })
  return { accessToken: signAccessToken(userId, jwtSecret), refreshToken }
}
