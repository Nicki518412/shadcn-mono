import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type RolePageResult = components["schemas"]["RolePageResult"]
export type RoleListItem = components["schemas"]["RoleListItem"]
type RoleDetail = components["schemas"]["RoleDetail"]

/** POST /api/roles 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
export type RoleCreateInput = NonNullable<
  paths["/api/roles"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/roles/{id} 请求体（code 可改——后端统一大写规范化） */
export type RoleUpdateInput = NonNullable<
  paths["/api/roles/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]
/** PUT /api/roles/{id}/menus 请求体（全量替换，含按钮节点） */
export type RoleGrantInput = NonNullable<
  paths["/api/roles/{id}/menus"]["put"]["requestBody"]
>["content"]["application/json"]

/** 角色查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页/搜索变体失效重取 */
export const ROLES_QUERY_KEY = ["roles"] as const

/** 角色分页列表查询（queryKey ["roles", page, pageSize, keyword]） */
export function useRolesQuery(page: number, pageSize: number, keyword: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (keyword) params.set("keyword", keyword)
  return useQuery({
    queryKey: [...ROLES_QUERY_KEY, page, pageSize, keyword],
    queryFn: () => api<RolePageResult>(`/roles?${params.toString()}`),
  })
}

/** 角色全量列表（用户表单/分配角色等选项源，GET /api/roles/list 无分页） */
export function useRolesListQuery() {
  return useQuery({
    queryKey: [...ROLES_QUERY_KEY, "list"],
    queryFn: () => api<RoleListItem[]>("/roles/list"),
  })
}

/** 角色已授权菜单 id（树形勾选回显，GET /api/roles/{id}/menus） */
export function useRoleMenusQuery(roleId: string) {
  return useQuery({
    queryKey: [...ROLES_QUERY_KEY, roleId, "menus"],
    queryFn: () =>
      api<
        NonNullable<
          paths["/api/roles/{id}/menus"]["get"]["responses"]["200"]["content"]["application/json"]
        >["data"]
      >(`/roles/${roleId}/menus`),
  })
}

/** 创建角色（POST /api/roles） */
export function useCreateRoleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RoleCreateInput) =>
      api<RoleDetail>("/roles", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      toast.success("角色创建成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新角色（PATCH /api/roles/{id}） */
export function useUpdateRoleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: RoleUpdateInput }) =>
      api<RoleDetail>(`/roles/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      toast.success("角色更新成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除角色（DELETE /api/roles/{id}，服务端自动清理 UserRole） */
export function useDeleteRoleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      toast.success("角色已删除")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 分配菜单权限（PUT /api/roles/{id}/menus，全量替换，含按钮节点） */
export function useAssignMenusMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; menuIds: string[] }) =>
      api<null>(`/roles/${input.id}/menus`, {
        method: "PUT",
        body: JSON.stringify({ menuIds: input.menuIds } satisfies RoleGrantInput),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
      toast.success("权限分配成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
