import type { JSX } from "react"
import { useNavigate } from "react-router"
import { SearchXIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/** 404 兜底页（AppLayout 内层路由未命中时的出口），返回首页按钮供恢复导航 */
export default function NotFoundPage(): JSX.Element {
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <SearchXIcon className="size-8" />
      <p className="text-lg font-medium text-foreground">404</p>
      <p>页面不存在</p>
      <Button variant="outline" size="sm" onClick={() => void navigate("/")}>
        返回首页
      </Button>
    </div>
  )
}
