import type { JSX } from "react"

// Task 23：完善为带返回入口的错误页
export default function NotFoundPage(): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
      <p className="text-lg font-medium text-foreground">404</p>
      <p>页面不存在</p>
    </div>
  )
}
