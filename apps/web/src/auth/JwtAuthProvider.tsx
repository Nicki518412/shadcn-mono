import type { AuthProvider, AuthSession, LoginCredential, OtpChannel, SessionUser } from "./types"
import { api } from "../api/client"
import {
  API_BASE,
  clearTokens,
  doRefresh,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../api/session"
import type { ApiEnvelope } from "../api/session"
import type { components } from "../api/schema"

type LoginResponse = components["schemas"]["LoginResponse"]

/** JWT 实现：双 token 由 session.ts 持有（access 内存 + refresh localStorage），401 由 api() 拦截自动续期 */
export class JwtAuthProvider implements AuthProvider {
  /** 最近一次拿到的 user（login / getSession 写入）；refresh 响应只含 TokenPair，用它补全 session.user */
  private lastUser: SessionUser | null = null

  async login(cred: LoginCredential): Promise<AuthSession> {
    const path = cred.kind === "password" ? "/auth/login" : "/auth/otp/login"
    const payload =
      cred.kind === "password"
        ? { username: cred.username, password: cred.password }
        : { channel: cred.channel, target: cred.target, code: cred.code }
    // 登录是公开接口，且 401 表示凭据错误（而非会话过期）——不走 api() 的自动 refresh 流程
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => null)) as ApiEnvelope<LoginResponse> | null
    const message = body?.message ?? "登录失败"
    if (!res.ok || body?.code !== 0) throw new Error(message)
    const { user, accessToken, refreshToken } = body.data
    setAccessToken(accessToken)
    setRefreshToken(refreshToken)
    this.lastUser = user
    return { user, accessToken }
  }

  async sendOtp(channel: OtpChannel, target: string): Promise<void> {
    await api<{ sent: boolean }>("/auth/otp/send", {
      method: "POST",
      body: JSON.stringify({ channel, target }),
    })
  }

  async logout(): Promise<void> {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        })
      } catch {
        // 服务端吊销失败不阻塞本地登出（本地 token 清理优先）
      }
    }
    clearTokens()
    this.lastUser = null
  }

  /** refresh 响应是 TokenPair（无 user）：优先用 lastUser 补全；冷启动无缓存时回源 /auth/me */
  async refresh(): Promise<AuthSession> {
    await doRefresh()
    const accessToken = getAccessToken() ?? ""
    if (this.lastUser) return { user: this.lastUser, accessToken }
    const session = await this.getSession()
    if (!session) throw new Error("获取会话失败，请重新登录")
    return { user: session.user, accessToken }
  }

  /** 登录守卫用：失败返回 null 不抛 */
  async getSession(): Promise<AuthSession | null> {
    try {
      const data = await api<components["schemas"]["MeResponse"]>("/auth/me")
      this.lastUser = data.user
      return { user: data.user, accessToken: getAccessToken() ?? "" }
    } catch {
      return null
    }
  }
}
