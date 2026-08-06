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

export async function issueTokenPair(userId: string, jwtSecret: string): Promise<TokenPair> {
  const refreshToken = generateRefreshToken()
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  })
  return { accessToken: signAccessToken(userId, jwtSecret), refreshToken }
}
