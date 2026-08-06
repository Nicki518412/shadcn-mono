import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type UserPageResult = components["schemas"]["UserPageResult"]
export type UserListItem = components["schemas"]["UserListItem"]
type UserDetail = components["schemas"]["UserDetail"]
export type UserCreateInput = NonNullable<
  paths["/api/users"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/users/{id} 请求体 */
export type UserUpdateInput = NonNullable<
  paths["/api/users/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** users 查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页/搜索变体失效重取 */
export const USERS_QUERY_KEY = ["users"] as const

/** 用户分页列表查询（queryKey ["users", page, pageSize, keyword]） */
export function useUsersQuery(page: number, pageSize: number, keyword: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (keyword) params.set("keyword", keyword)
  return useQuery({
    queryKey: [...USERS_QUERY_KEY, page, pageSize, keyword],
    queryFn: () => api<UserPageResult>(`/users?${params.toString()}`),
  })
}

/** 创建用户（POST /api/users） */
export function useCreateUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UserCreateInput) =>
      api<UserDetail>("/users", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success("用户创建成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新用户（PATCH /api/users/{id}） */
export function useUpdateUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: UserUpdateInput }) =>
      api<UserDetail>(`/users/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success("用户更新成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除用户（DELETE /api/users/{id}） */
export function useDeleteUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success("用户已删除")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 分配角色（PUT /api/users/{id}/roles，全量替换） */
export function useAssignRolesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; roleIds: string[] }) =>
      api<UserDetail>(`/users/${input.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds: input.roleIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY })
      toast.success("角色分配成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
