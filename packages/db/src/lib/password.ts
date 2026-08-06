// scrypt 密码哈希（N=2^17，异步调用不阻塞事件循环；格式 scrypt$salt$hash，无存量哈希故无兼容问题）
// 内存占用 128*N*r = 32MB，达到默认 maxmem(32MB) 上限，需显式上调（否则 OpenSSL 报 memory limit exceeded）
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

const SCRYPT_N = 32768
const SCRYPT_MAXMEM = 64 * 1024 * 1024

function scryptAsync(password: string, salt: string, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err)
      else resolve(derived)
    })
  })
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const derived = await scryptAsync(plain, salt, 64, { N: SCRYPT_N, maxmem: SCRYPT_MAXMEM })
  return `scrypt$${salt}$${derived.toString("hex")}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const salt = parts[1] ?? ""
  const expected = parts[2] ?? ""
  const derived = await scryptAsync(plain, salt, 64, { N: SCRYPT_N, maxmem: SCRYPT_MAXMEM })
  const b = Buffer.from(expected, "hex")
  return derived.length === b.length && timingSafeEqual(derived, b)
}
