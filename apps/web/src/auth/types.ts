export interface SessionUser {
  id: string
  username: string
  nickname: string
  email: string | null
  telephone: string | null
}

export type LoginCredential =
  | { kind: "password"; username: string; password: string }
  | { kind: "otp"; channel: "email" | "telephone"; target: string; code: string }

export type OtpChannel = "email" | "telephone"

export interface AuthSession {
  user: SessionUser
  accessToken: string
}

export interface AuthProvider {
  /** 返回 session；失败抛出 Error（message 为后端响应文案） */
  login(cred: LoginCredential): Promise<AuthSession>
  sendOtp(channel: OtpChannel, target: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<AuthSession>
  /** 登录守卫用：未登录/过期返回 null（不抛） */
  getSession(): Promise<AuthSession | null>
}
