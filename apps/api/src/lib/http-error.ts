import type { ContentfulStatusCode } from "hono/utils/http-status"

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
export function conflict(message = "数据冲突"): HttpError {
  return new HttpError(409, "CONFLICT", message)
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
