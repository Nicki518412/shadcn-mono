/**
 * 提取 Prisma P2002（唯一约束冲突）的字段级错误消息。
 * 三方言的 P2002 message 均含冲突字段名，按包含匹配：
 * - SQLite/MySQL: `Unique constraint failed on the fields: (`username`)`
 * - PostgreSQL: `Unique constraint failed on the fields: (`username`)`（也含字段名）
 * 非 P2002 或字段不在映射中返回 null（调用方回退：命中映射 → 409 字段级消息；未命中 → 重抛，
 * 由根应用 onError 的 P2002 兜底转通用 409 "数据冲突"，保持既有语义）。
 */
export function p2002FieldMessage(err: unknown, fieldMessages: Record<string, string>): string | null {
  if (typeof err !== "object" || err === null || (err as { code?: string }).code !== "P2002") return null
  const message = err instanceof Error ? err.message : ""
  for (const [field, text] of Object.entries(fieldMessages)) {
    if (message.includes(field)) return text
  }
  return null
}
