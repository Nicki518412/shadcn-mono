import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type AnnouncementPageResult = components["schemas"]["AnnouncementPageResult"]
export type AnnouncementItem = components["schemas"]["AnnouncementItem"]
type LatestAnnouncement = components["schemas"]["LatestAnnouncement"]

/** POST /api/announcements 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
export type AnnouncementCreateInput = NonNullable<
  paths["/api/announcements"]["post"]["requestBody"]
>["content"]["application/json"]
/** PATCH /api/announcements/{id} 请求体 */
export type AnnouncementUpdateInput = NonNullable<
  paths["/api/announcements/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

/** 公告查询 key 前缀：mutation 成功后 invalidate 前缀即列表与最新公告（Dashboard 横幅）同时刷新 */
export const ANNOUNCEMENTS_QUERY_KEY = ["announcements"] as const

/** 公告分页列表（管理页；queryKey ["announcements", page, pageSize]） */
export function useAnnouncementsQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_QUERY_KEY, page, pageSize],
    queryFn: () =>
      api<AnnouncementPageResult>(`/announcements?page=${String(page)}&pageSize=${String(pageSize)}`),
  })
}

/** 最新已发布公告（Dashboard 横幅；全员接口仅要求登录） */
export function useLatestAnnouncementQuery() {
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_QUERY_KEY, "latest"],
    queryFn: () => api<LatestAnnouncement>("/announcements/latest"),
  })
}

/** 创建公告（POST /api/announcements） */
export function useCreateAnnouncementMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("announcement")
  return useMutation({
    mutationFn: (input: AnnouncementCreateInput) =>
      api<AnnouncementItem>("/announcements", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY })
      toast.success(t("createSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 更新公告（PATCH /api/announcements/{id}） */
export function useUpdateAnnouncementMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("announcement")
  return useMutation({
    mutationFn: (input: { id: string; body: AnnouncementUpdateInput }) =>
      api<AnnouncementItem>(`/announcements/${input.id}`, { method: "PATCH", body: JSON.stringify(input.body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY })
      toast.success(t("updateSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 删除公告（DELETE /api/announcements/{id}） */
export function useDeleteAnnouncementMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("announcement")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_QUERY_KEY })
      toast.success(t("deleteSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
