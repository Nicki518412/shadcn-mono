import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components, paths } from "@/api/schema"

type NotificationPageResult = components["schemas"]["NotificationPageResult"]
export type NotificationItem = components["schemas"]["NotificationItem"]
type UnreadCount = components["schemas"]["UnreadCount"]

/** POST /api/notifications 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
export type NotificationCreateInput = NonNullable<
  paths["/api/notifications"]["post"]["requestBody"]
>["content"]["application/json"]

/** 通知查询 key 前缀：已读操作成功后 invalidate 前缀即列表与未读数同时刷新（顶栏徽标联动） */
export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const

/** 我的通知分页列表（queryKey ["notifications", "list", page, pageSize]，按创建时间倒序） */
export function useNotificationsQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, "list", page, pageSize],
    queryFn: () =>
      api<NotificationPageResult>(`/notifications?page=${String(page)}&pageSize=${String(pageSize)}`),
  })
}

/** 未读通知数（顶栏徽标；60s 轮询 + 窗口聚焦刷新（TanStack Query 默认）兜底跨会话未读变化） */
export function useUnreadCountQuery() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, "unread-count"],
    queryFn: () => api<UnreadCount>("/notifications/unread-count"),
    refetchInterval: 60_000,
  })
}

/** 标记单条已读（PATCH /api/notifications/{id}/read） */
export function useReadNotificationMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("notifications")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
      toast.success(t("markReadSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 全部标记已读（PATCH /api/notifications/read-all） */
export function useReadAllNotificationsMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("notifications")
  return useMutation({
    mutationFn: () => api<UnreadCount>("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
      toast.success(t("markAllReadSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}

/** 发送通知（POST /api/notifications；按钮由 <Permission code="system:notification:create"> 门控） */
export function useCreateNotificationMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("notifications")
  return useMutation({
    mutationFn: (input: NotificationCreateInput) =>
      api<NotificationItem>("/notifications", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
      toast.success(t("sendSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
