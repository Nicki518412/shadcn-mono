import { useQuery } from "@tanstack/react-query"
import { Navigate, Outlet, useLocation } from "react-router"
import type { JSX } from "react"

import { api } from "@/api/client"
import type { components } from "@/api/schema"
import { useAuth } from "@/auth/AuthProvider"
import { Spinner } from "@/components/ui/spinner"

type MeResponse = components["schemas"]["MeResponse"]

/**
 * 共享 me 查询（queryKey ["me"]，RequireAuth 与 AppLayout 复用同一缓存，只发一次请求）：
 * - 会话判定必须走 auth.getSession()（Task 16 接缝：Clerk 模式下 api() 无 token，
 *   getSession 是 provider 抽象；JwtAuthProvider 内部走 /auth/me + 自动 refresh）
 * - getSession 仅返回 AuthSession（user + accessToken），navTree 需要完整 MeResponse，
 *   成功后再补一次 /auth/me（queryFn 失败时该查询整体报错，守卫按未登录处理）
 */
export function useMeQuery() {
  const auth = useAuth()
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MeResponse | null> => {
      const session = await auth.getSession()
      if (!session) return null
      return api<MeResponse>("/auth/me")
    },
  })
}

/** 登录守卫：加载中 → 加载态；无会话/请求失败 → 重定向 /login（携带 from 供后续跳转恢复）；有会话 → 子路由 */
export function RequireAuth(): JSX.Element {
  const { data, status } = useMeQuery()
  const location = useLocation()

  if (status === "pending") {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
        <Spinner /> 加载中…
      </div>
    )
  }

  // 请求失败通常是 token 失效（refresh 已由 getSession/api 内部重试过），按未登录处理
  if (status === "error" || !data) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
