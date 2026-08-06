import type { Context } from "hono"
import type { ZodError } from "zod"

type ValidationResult = ({ success: true; data: unknown } | { success: false; error: ZodError }) & {
  target: unknown
}

/** zod 校验失败统一 400 契约体（校验失败不 throw，onError 捕获不到）；根应用与子应用共用 */
export function validationHook(
  result: ValidationResult,
  c: Context,
): Response | undefined {
  if (!result.success) {
    return c.json(
      { code: "BAD_REQUEST", message: result.error.issues[0]?.message ?? "请求参数错误", data: null },
      400,
    )
  }
  return undefined
}
