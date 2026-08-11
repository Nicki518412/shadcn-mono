import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type DepartmentList = components["schemas"]["DepartmentList"]
export type DepartmentItem = components["schemas"]["DepartmentItem"]

/** POST /api/departments 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
export type DepartmentCreateInput = NonNullable<
  paths["/api/departments"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/departments/{id} 请求体 */
export type DepartmentUpdateInput = NonNullable<
  paths["/api/departments/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** 部门查询 key 前缀：mutation 成功后 invalidate 前缀即列表刷新 */
export const DEPARTMENTS_QUERY_KEY = ["departments"] as const

/** 部门全量列表（扁平；树由页面构建） */
export function useDepartmentsQuery() {
  return useQuery({
    queryKey: DEPARTMENTS_QUERY_KEY,
    queryFn: () => api<DepartmentList>("/departments"),
  })
}

/** 新建部门（POST /api/departments） */
export function useCreateDepartmentMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("department")
  return useMutation({
    mutationFn: (input: DepartmentCreateInput) =>
      api<DepartmentItem>("/departments", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY })
      toast.success(t("createSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新部门（PATCH /api/departments/{id}） */
export function useUpdateDepartmentMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("department")
  return useMutation({
    mutationFn: (input: { id: string; body: DepartmentUpdateInput }) =>
      api<DepartmentItem>(`/departments/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY })
      toast.success(t("updateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除部门（DELETE /api/departments/{id}，级联删子树） */
export function useDeleteDepartmentMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("department")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY })
      toast.success(t("deleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
