import { useEffect } from "react"
import type { JSX, ReactNode } from "react"
import { useAuth, useUser } from "@clerk/clerk-react"

import { getAccessToken, getTokenRefresher, setAccessToken, setTokenRefresher } from "../api/session"
import type { AuthProvider, AuthSession, SessionUser } from "./types"

/** Clerk UserResource 结构子集（toSessionUser 用；避免依赖 @clerk/types 的类型导入） */
interface ClerkUserLike {
  id: string
  username: string | null
  firstName: string | null
  lastName: string | null
  primaryEmailAddress: { emailAddress: string } | null
  primaryPhoneNumber: { phoneNumber: string } | null
}

/** Clerk 档案 → SessionUser 映射（getSession 只做会话判定；本地用户档案（含 roles）由守卫补 /auth/me 获取） */
function toSessionUser(user: ClerkUserLike): SessionUser {
  return {
    id: user.id,
    username: user.username ?? user.primaryEmailAddress?.emailAddress.split("@")[0] ?? user.id,
    nickname: [user.firstName, user.lastName].filter(Boolean).join(" ") || (user.username ?? user.id),
    email: user.primaryEmailAddress?.emailAddress ?? null,
    telephone: user.primaryPhoneNumber?.phoneNumber ?? null,
  }
}

/**
 * 桥接层：Clerk hooks 只能在 <ClerkProvider> 内使用，provider 类无法直接调用（Task 24 已定调方案）。
 * ClerkSessionAdapter 在组件内把会话状态与操作写入本桥，ClerkAuthProvider 从桥读取。
 * 模块级单例，与 app 同生命周期；adapter 卸载时清空。
 */
export const clerkBridge = {
  /** 当前会话用户（Clerk 档案映射；无会话/未加载为 null） */
  sessionUser: null as SessionUser | null,
  /** Clerk 登出（useAuth().signOut 包装） */
  signOut: null as (() => Promise<void>) | null,
}

/**
 * 会话桥接组件（须在 <ClerkProvider> 内）：
 * - 会话就绪时把 Clerk session token 同步进 session.ts（api() 的 Bearer 来源）
 * - 注册 token 刷新器（api() 401 时重取）与 signOut 到桥；会话变化时刷新桥状态
 * - 登出/无会话时清空 token 与桥状态
 */
export function ClerkSessionAdapter({ children }: { children: ReactNode }): JSX.Element {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth()
  const { user } = useUser()

  // token 同步：会话就绪 → getToken() → setAccessToken；无会话 → 清空
  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setAccessToken(null)
      return
    }
    let disposed = false
    void getToken().then((token) => {
      // 迟解析守卫：effect 重跑（登出/会话切换）后不再回写旧 token
      if (token && !disposed) setAccessToken(token)
    })
    return () => {
      disposed = true
    }
  }, [isLoaded, isSignedIn, getToken])

  // 桥状态：当前会话用户（getSession 的判定依据）
  useEffect(() => {
    clerkBridge.sessionUser = isLoaded && isSignedIn && user ? toSessionUser(user) : null
    return () => {
      clerkBridge.sessionUser = null
    }
  }, [isLoaded, isSignedIn, user])

  // 注册 401 刷新器（session.ts，api() 与 refresh() 共用同一注册点）与登出操作（卸载时清理；StrictMode 双重挂载安全）
  useEffect(() => {
    clerkBridge.signOut = signOut
    setTokenRefresher(getToken)
    return () => {
      clerkBridge.signOut = null
      setTokenRefresher(null)
    }
  }, [getToken, signOut])

  return <>{children}</>
}

/**
 * Clerk 实现：会话由 Clerk 托管（<ClerkProvider> + <SignIn/>），本实现只做映射——
 * 登录/验证码抛错（由 Clerk 组件处理）；getSession 读桥（Clerk 会话判定）；
 * logout 走 Clerk signOut；refresh 重取 token 同步进 session.ts。
 * api() 的 Bearer token 由 ClerkSessionAdapter 同步，401 走桥注册的刷新器。
 */
export class ClerkAuthProvider implements AuthProvider {
  async login(): Promise<AuthSession> {
    // 契约：返回 rejected promise（调用方可能用 .catch 链）；Clerk 模式下登录不可达（<SignIn/> 处理）
    return await Promise.reject(new Error("Clerk 模式下登录由 <SignIn/> 组件处理"))
  }

  async sendOtp(): Promise<void> {
    await Promise.reject(new Error("Clerk 模式下验证码由 Clerk 处理"))
  }

  async logout(): Promise<void> {
    if (clerkBridge.signOut) {
      try {
        await clerkBridge.signOut()
      } catch {
        // Clerk 登出失败不阻塞本地清理（与 Jwt 版服务端吊销失败的容忍语义一致）
      }
    }
    setAccessToken(null)
    clerkBridge.sessionUser = null
  }

  /** 重取 token 并同步进 session.ts；返回当前会话（无会话抛错，与 Jwt 版 refresh 语义对齐） */
  async refresh(): Promise<AuthSession> {
    const session = await this.getSession()
    if (!session) throw new Error("Clerk 会话未就绪，请重新登录")
    // 复用 session.ts 注册的刷新器（与 api() 401 路径同一注册点；adapter 未挂载时跳过 token 刷新）
    const refresher = getTokenRefresher()
    if (refresher) {
      const token = await refresher()
      if (token) setAccessToken(token)
    }
    return { user: session.user, accessToken: getAccessToken() ?? "" }
  }

  /** 会话判定：读桥（Clerk 会话 + 用户已加载）；无会话返回 null（不抛） */
  getSession(): Promise<AuthSession | null> {
    const user = clerkBridge.sessionUser
    if (!user) return Promise.resolve(null)
    return Promise.resolve({ user, accessToken: getAccessToken() ?? "" })
  }
}
