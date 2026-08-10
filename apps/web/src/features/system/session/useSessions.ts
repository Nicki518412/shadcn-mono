import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import type { components } from "@/api/schema"

type SessionPageResult = components["schemas"]["SessionPageResult"]
export type SessionItem = components["schemas"]["SessionItem"]

/** sessions 查询 key 前缀：mutation 成功后 invalidate 前缀即所有分页/搜索变体失效重取 */
export const SESSIONS_QUERY_KEY = ["sessions"] as const

/** 在线会话分页查询（queryKey ["sessions", page, pageSize, keyword]） */
export function useSessionsQuery(page: number, pageSize: number, keyword: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (keyword) params.set("keyword", keyword)
  return useQuery({
    queryKey: [...SESSIONS_QUERY_KEY, page, pageSize, keyword],
    queryFn: () => api<SessionPageResult>(`/sessions?${params.toString()}`),
  })
}

/** 强制下线单个会话（DELETE /api/sessions/{id}） */
export function useRevokeSessionMutation() {
  const queryClient = useQueryClient()
  const { t } = useTranslation("sessions")
  return useMutation({
    mutationFn: (id: string) => api<null>(`/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY })
      toast.success(t("forceSignoutSuccess"))
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error))
    },
  })
}
