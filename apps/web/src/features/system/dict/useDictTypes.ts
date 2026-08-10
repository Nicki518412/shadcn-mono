import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type DictTypePageResult = components["schemas"]["DictTypePageResult"]
export type DictTypeListItem = components["schemas"]["DictTypeListItem"]
export type DictTypeDetail = components["schemas"]["DictTypeDetail"]
export type DictItem = components["schemas"]["DictItem"]

/** POST /api/dicts/types 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
export type DictTypeCreateInput = NonNullable<
  paths["/api/dicts/types"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/dicts/types/{id} 请求体 */
export type DictTypeUpdateInput = NonNullable<
  paths["/api/dicts/types/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]
/** PUT /api/dicts/types/{id}/items 请求体（全量替换字典项） */
export type DictItemsPutInput = NonNullable<
  paths["/api/dicts/types/{id}/items"]["put"]["requestBody"]
>["content"]["application/json"]

/** 字典类型查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页/搜索/详情变体失效重取 */
export const DICT_TYPES_QUERY_KEY = ["dictTypes"] as const

/** 字典类型分页列表查询（queryKey ["dictTypes", page, pageSize, keyword]） */
export function useDictTypesQuery(page: number, pageSize: number, keyword: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (keyword) params.set("keyword", keyword)
  return useQuery({
    queryKey: [...DICT_TYPES_QUERY_KEY, page, pageSize, keyword],
    queryFn: () => api<DictTypePageResult>(`/dicts/types?${params.toString()}`),
  })
}

/** 字典类型详情（含字典项，GET /api/dicts/types/{id}） */
export function useDictTypeQuery(typeId: string) {
  return useQuery({
    queryKey: [...DICT_TYPES_QUERY_KEY, typeId],
    queryFn: () => api<DictTypeDetail>(`/dicts/types/${typeId}`),
  })
}

/** 创建字典类型（POST /api/dicts/types） */
export function useCreateDictTypeMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("dict")
  return useMutation({
    mutationFn: (input: DictTypeCreateInput) =>
      api<DictTypeListItem>("/dicts/types", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DICT_TYPES_QUERY_KEY })
      toast.success(t("createSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新字典类型（PATCH /api/dicts/types/{id}） */
export function useUpdateDictTypeMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("dict")
  return useMutation({
    mutationFn: (input: { id: string; body: DictTypeUpdateInput }) =>
      api<DictTypeDetail>(`/dicts/types/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DICT_TYPES_QUERY_KEY })
      toast.success(t("updateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除字典类型（DELETE /api/dicts/types/{id}，字典项服务端级联删除） */
export function useDeleteDictTypeMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("dict")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/dicts/types/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DICT_TYPES_QUERY_KEY })
      toast.success(t("deleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 保存字典项（PUT /api/dicts/types/{id}/items，全量替换） */
export function useSaveDictItemsMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("dict")
  return useMutation({
    mutationFn: (input: { id: string; body: DictItemsPutInput }) =>
      api<null>(`/dicts/types/${input.id}/items`, {
        method: "PUT",
        body: JSON.stringify(input.body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DICT_TYPES_QUERY_KEY })
      toast.success(t("saveItemsSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
