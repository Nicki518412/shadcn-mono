import type { JSX, ReactNode } from "react"

import { usePermissionCodes } from "@/hooks/usePermissionCodes"

/**
 * 按钮级权限门控：permissionCodes 含 code 时渲染 children，否则渲染 fallback（默认不渲染）。
 * 用法：<Permission code="system:user:create"><Button>新增</Button></Permission>
 */
export function Permission({
  code,
  children,
  fallback = null,
}: {
  code: string
  children: ReactNode
  fallback?: ReactNode
}): JSX.Element {
  const codes = usePermissionCodes()
  return <>{codes.has(code) ? children : fallback}</>
}
