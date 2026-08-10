import type { JSX } from "react"
import { useNavigate } from "react-router"
import { SearchXIcon } from "lucide-react"

import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

/** 404 兜底页（AppLayout 内层路由未命中时的出口），返回首页按钮供恢复导航 */
export default function NotFoundPage(): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <SearchXIcon className="size-8" />
      <p className="text-lg font-medium text-foreground">404</p>
      <p>{t("pageNotFound")}</p>
      <Button variant="outline" size="sm" onClick={() => void navigate("/")}>
        {t("backToHome")}
      </Button>
    </div>
  )
}
