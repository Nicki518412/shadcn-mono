import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const SCRYPT_N = 16384

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(plain, salt, 64, { N: SCRYPT_N }).toString("hex")
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const salt = parts[1] ?? ""
  const expected = parts[2] ?? ""
  const actual = scryptSync(plain, salt, 64, { N: SCRYPT_N }).toString("hex")
  const a = Buffer.from(actual, "hex")
  const b = Buffer.from(expected, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}
