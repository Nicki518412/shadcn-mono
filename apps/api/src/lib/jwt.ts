import { createHmac, timingSafeEqual } from "node:crypto"

const ACCESS_TTL_SECONDS = 5 * 60

export function signAccessToken(userId: string, secret: string, now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + ACCESS_TTL_SECONDS, iat: Math.floor(now / 1000) }),
  ).toString("base64url")
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")
  return `${header}.${payload}.${sig}`
}

export function verifyAccessToken(token: string, secret: string): string | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  const expected = createHmac("sha256", secret).update(`${header ?? ""}.${payload ?? ""}`).digest("base64url")
  const a = Buffer.from(sig ?? "")
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as {
      sub?: unknown
      exp?: unknown
    }
    if (typeof data.sub !== "string") return null
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null
    return data.sub
  } catch {
    return null
  }
}
