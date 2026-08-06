import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

export type MenuNode = components["schemas"]["MenuNode"]
/** POST /api/menus 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
export type MenuCreateInput = NonNullable<
  paths["/api/menus"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/menus/{id} 请求体（改类型/父节点需满足后端约束：类型约束、防自挂、子节点兼容） */
export type MenuUpdateInput = NonNullable<
  paths["/api/menus/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** menus 查询 key 前缀：mutation 成功后 invalidate 前缀即所有变体失效重取 */
export const MENUS_QUERY_KEY = ["menus"] as const

/**
 * 全量菜单树（管理页树表格 + 表单父节点选项源；GET /api/menus/tree 含按钮节点）。
 * queryKey ["menus", "tree"] 与 Task 21 useRoles.ts 原实现保持一致——迁移后缓存无缝衔接。
 */
export function useMenuTreeQuery() {
  return useQuery({
    queryKey: ["menus", "tree"],
    queryFn: () => api<MenuNode[]>("/menus/tree"),
  })
}

/** 菜单变更的联动失效：菜单树 + 角色授权树的菜单数据 + me 的导航树/权限码 */
function invalidateMenuDependents(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: MENUS_QUERY_KEY })
  void queryClient.invalidateQueries({ queryKey: ["roles"] })
  void queryClient.invalidateQueries({ queryKey: ["me"] })
}

/** 创建菜单（POST /api/menus，后端校验类型约束与权限码唯一 409——错误 message 直接展示） */
export function useCreateMenuMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MenuCreateInput) =>
      api<MenuNode>("/menus", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      invalidateMenuDependents(queryClient)
      toast.success("菜单创建成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新菜单（PATCH /api/menus/{id}；改父节点/类型时后端校验防自挂与子节点兼容，400 message 直接展示） */
export function useUpdateMenuMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: MenuUpdateInput }) =>
      api<MenuNode>(`/menus/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      invalidateMenuDependents(queryClient)
      toast.success("菜单更新成功")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除菜单（DELETE /api/menus/{id}，服务端级联删除子树并清理 RoleMenu 关联） */
export function useDeleteMenuMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<null>(`/menus/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateMenuDependents(queryClient)
      toast.success("菜单已删除")
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
