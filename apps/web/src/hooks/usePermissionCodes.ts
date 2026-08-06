import { useMeQuery } from "../router/guards"

/**
 * 当前用户按钮级权限码集合（服务端按角色交集后的 permissionCodes）。
 * 复用守卫 me 查询缓存（ME_QUERY_KEY，RequireAuth 已拉取——不重复请求，
 * 查询参数如 staleTime/retry 与守卫完全一致）；未登录/无数据时返回空集。
 */
export function usePermissionCodes(): Set<string> {
  const { data } = useMeQuery()
  return new Set(data?.permissionCodes ?? [])
}
