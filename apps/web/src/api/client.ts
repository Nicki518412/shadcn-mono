import { API_BASE, doRefresh, getAccessToken, getTokenRefresher, setAccessToken } from "./session"
import type { ApiEnvelope } from "./session"

/** 统一错误文案：api() 契约一律抛 Error（message 为后端文案或网络错误兜底）；非 Error 兜底通用文案 */
export function apiErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "操作失败，请重试"
}

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
 * - 401 → 刷新 token 重试一次（不递归，防死循环）：Clerk 模式经注册的刷新器重取 session token，
 *   JWT 模式走 doRefresh 轮换双 token（单飞）；刷新失败/无 token 时透传原 401 错误
 * - 响应体 { code, data, message }：非 2xx 或 code !== 0 抛 Error(message)
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json")
  const token = getAccessToken()
  if (token) headers.set("authorization", `Bearer ${token}`)
  let res = await safeFetch(path, init, headers)
  if (res.status === 401) {
    // Clerk 模式：经注册的刷新器重取 session token（无 token 返回则放弃重试，走下方统一错误）；
    // JWT 模式：doRefresh 轮换双 token（失败时已清空 tokens 并抛错）
    const refresher = getTokenRefresher()
    let freshToken: string | null
    if (refresher) {
      freshToken = await refresher()
    } else {
      await doRefresh()
      freshToken = getAccessToken()
    }
    if (freshToken) {
      setAccessToken(freshToken)
      headers.set("authorization", `Bearer ${freshToken}`)
      res = await safeFetch(path, init, headers)
    }
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  const message = body?.message ?? `请求失败(${String(res.status)})`
  if (!res.ok || body?.code !== 0) throw new Error(message)
  return body.data
}
