import { useQuery } from "@tanstack/react-query"

import { api } from "@/api/client"
import type { components } from "@/api/schema"

type LoginLogPageResult = components["schemas"]["LoginLogPageResult"]
type OperationLogPageResult = components["schemas"]["OperationLogPageResult"]
export type LoginLogItem = components["schemas"]["LoginLogItem"]
export type OperationLogItem = components["schemas"]["OperationLogItem"]

function pageParams(page: number, pageSize: number, keyword: string): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (keyword) params.set("keyword", keyword)
  return params.toString()
}

/** 登录日志分页查询（queryKey ["logs", "login", page, pageSize, keyword]） */
export function useLoginLogsQuery(page: number, pageSize: number, keyword: string) {
  return useQuery({
    queryKey: ["logs", "login", page, pageSize, keyword],
    queryFn: () => api<LoginLogPageResult>(`/logs/login?${pageParams(page, pageSize, keyword)}`),
  })
}

/** 操作日志分页查询（queryKey ["logs", "operation", page, pageSize, keyword]） */
export function useOperationLogsQuery(page: number, pageSize: number, keyword: string) {
  return useQuery({
    queryKey: ["logs", "operation", page, pageSize, keyword],
    queryFn: () => api<OperationLogPageResult>(`/logs/operation?${pageParams(page, pageSize, keyword)}`),
  })
}
