import type { JSX } from "react"

/**
 * 页面统一页头：标题 + 描述上下排布（管理页的操作工具栏放在页头下方的独立行，
 * 搜索/新增等按钮不占用本组件）。
 */
export function PageHeader({
  title,
  description,
}: {
  title: string
  description?: string
}): JSX.Element {
  return (
    <div className="space-y-1">
      <h1 className="font-heading text-xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}
