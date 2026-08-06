import type { components } from "./schema"

/** BASE 单一来源：client.ts / JwtAuthProvider 均从本模块导入，避免重复定义 */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api"

/**
 * 后端统一响应包装：成功 code=0（字面量类型，供 TS 判别收窄）；
 * 失败体为 ErrorBody（code 为字符串错误码）
 */
export type ApiEnvelope<T> = { code: 0; data: T; message: string } | components["schemas"]["ErrorBody"]

const REFRESH_TOKEN_KEY = "refreshToken"

/** access token 内存持有（页面刷新即失）；refresh token 存 localStorage（可跨刷新恢复会话） */
let accessToken: string | null = null

/** refresh 单飞：并发 401 只发一次 /auth/refresh，其余调用共享同一 promise */
let refreshPromise: Promise<void> | null = null

/** 401 恢复钩子：Clerk 模式由 ClerkSessionAdapter 注册（getToken 重取 session token），null = JWT 模式走 doRefresh */
export type TokenRefresher = () => Promise<string | null>

let tokenRefresher: TokenRefresher | null = null

export function setTokenRefresher(refresher: TokenRefresher | null): void {
  tokenRefresher = refresher
}

export function getTokenRefresher(): TokenRefresher | null {
  return tokenRefresher
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function clearTokens(): void {
  accessToken = null
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

/**
 * 调 /auth/refresh 轮换双 token：成功更新内存 access + localStorage refresh；
 * 失败 clearTokens 并抛错（错误透传给业务层，由登录守卫决定跳转）
 */
export function doRefresh(): Promise<void> {
  refreshPromise ??= (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearTokens()
      throw new Error("登录已过期，请重新登录")
    }
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    const body = (await res.json().catch(() => null)) as ApiEnvelope<components["schemas"]["TokenPair"]> | null
    const message = body?.message ?? `刷新会话失败(${String(res.status)})`
    if (!res.ok || body?.code !== 0) {
      clearTokens()
      throw new Error(message)
    }
    setAccessToken(body.data.accessToken)
    setRefreshToken(body.data.refreshToken)
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}
