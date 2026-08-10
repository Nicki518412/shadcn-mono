import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type ConfigPageResult = components["schemas"]["ConfigPageResult"]
export type ConfigListItem = components["schemas"]["ConfigListItem"]
type ConfigDetail = components["schemas"]["ConfigDetail"]

/** POST /api/configs 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
export type ConfigCreateInput = NonNullable<
  paths["/api/configs"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/configs/{id} 请求体 */
export type ConfigUpdateInput = NonNullable<
  paths["/api/configs/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** 参数查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页/搜索变体失效重取 */
export const CONFIGS_QUERY_KEY = ["configs"] as const

/** 系统参数分页列表查询（queryKey ["configs", page, pageSize, keyword]） */
export function useConfigsQuery(page: number, pageSize: number, keyword: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (keyword) params.set("keyword", keyword)
  return useQuery({
    queryKey: [...CONFIGS_QUERY_KEY, page, pageSize, keyword],
    queryFn: () => api<ConfigPageResult>(`/configs?${params.toString()}`),
  })
}

/** 创建系统参数（POST /api/configs） */
export function useCreateConfigMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("config")
  return useMutation({
    mutationFn: (input: ConfigCreateInput) =>
      api<ConfigDetail>("/configs", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONFIGS_QUERY_KEY })
      toast.success(t("createSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新系统参数（PATCH /api/configs/{id}） */
export function useUpdateConfigMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("config")
  return useMutation({
    mutationFn: (input: { id: string; body: ConfigUpdateInput }) =>
      api<ConfigDetail>(`/configs/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONFIGS_QUERY_KEY })
      toast.success(t("updateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除系统参数（DELETE /api/configs/{id}） */
export function useDeleteConfigMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("config")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/configs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONFIGS_QUERY_KEY })
      toast.success(t("deleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
