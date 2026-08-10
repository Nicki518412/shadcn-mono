import type { ContentfulStatusCode } from "hono/utils/http-status"

/**
 * HttpError.code 是 API 契约的一部分：前端按 code 经 i18n 的 errors 命名空间映射为当前语言文案，
 * message 为中文兜底（未知码/未映射时直接展示）。新增/修改错误码需同步
 * `apps/web/src/localization/locales/{zh,en}/errors.json`。
 */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string
  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function notFound(message = "资源不存在"): HttpError {
  return new HttpError(404, "NOT_FOUND", message)
}
export function badRequest(message = "请求参数错误"): HttpError {
  return new HttpError(400, "BAD_REQUEST", message)
}
export function unauthorized(message = "未登录或登录已过期"): HttpError {
  return new HttpError(401, "UNAUTHORIZED", message)
}
export function forbidden(message = "无权限访问"): HttpError {
  return new HttpError(403, "FORBIDDEN", message)
}
