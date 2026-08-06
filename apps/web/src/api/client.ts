import { API_BASE, doRefresh, getAccessToken } from "./session"
import type { ApiEnvelope } from "./session"

/** fetch 网络异常（TypeError，非 HTTP 错误）统一包装为业务 Error——api() 一律抛 Error 的契约 */
async function safeFetch(path: string, init: RequestInit, headers: Headers): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new Error("网络请求失败，请检查网络")
  }
}

/**
 * 统一 fetch 封装：
 * - 自动加 content-type: application/json + Bearer access token
 * - 401 → doRefresh（单飞）→ 用新 token 重试一次（不递归，防死循环）
 * - 响应体 { code, data, message }：非 2xx 或 code !== 0 抛 Error(message)
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json")
  const token = getAccessToken()
  if (token) headers.set("authorization", `Bearer ${token}`)
  let res = await safeFetch(path, init, headers)
  if (res.status === 401) {
    await doRefresh()
    const freshToken = getAccessToken()
    if (freshToken) headers.set("authorization", `Bearer ${freshToken}`)
    res = await safeFetch(path, init, headers)
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  const message = body?.message ?? `请求失败(${String(res.status)})`
  if (!res.ok || body?.code !== 0) throw new Error(message)
  return body.data
}
