/**
 * 提取 Prisma P2002（唯一约束冲突）的字段级错误信息：命中映射返回 { code, message }，未命中返回 null。
 * 三方言的 P2002 message 均含冲突字段名，按包含匹配：
 * - SQLite/MySQL: `Unique constraint failed on the fields: (`username`)`
 * - PostgreSQL: `Unique constraint failed on the fields: (`username`)`（也含字段名）
 * code 是 API 契约的一部分（前端 errors 命名空间按 code 映射多语言文案，见 http-error.ts 说明），
 * message 为中文兜底文案。
 * 非 P2002 或字段不在映射中返回 null（调用方回退：命中映射 → 409 字段级错误；未命中 → 重抛，
 * 由根应用 onError 的 P2002 兜底转通用 409 "数据冲突"，保持既有语义）。
 */
export function p2002Conflict(
  err: unknown,
  fieldMap: Record<string, { code: string; message: string }>,
): { code: string; message: string } | null {
  if (typeof err !== "object" || err === null || (err as { code?: string }).code !== "P2002") return null
  const message = err instanceof Error ? err.message : ""
  for (const [field, info] of Object.entries(fieldMap)) {
    if (message.includes(field)) return { code: info.code, message: info.message }
  }
  return null
}
