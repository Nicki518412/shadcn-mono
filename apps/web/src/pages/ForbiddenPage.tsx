import type { JSX } from "react"
import { useNavigate } from "react-router"
import { ShieldAlertIcon } from "lucide-react"

import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"

/**
 * 403 兜底页：当前系统权限交集已过滤导航，403 主要来自 API 层（错误边界/未来扩展使用）；
 * 以独立路由 /403 形式存在，可手动访问验证，页面按钮返回首页。
 */
export default function ForbiddenPage(): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <ShieldAlertIcon className="size-8" />
      <p className="text-lg font-medium text-foreground">403</p>
      <p>{t("forbidden")}</p>
      <Button variant="outline" size="sm" onClick={() => void navigate("/")}>
        {t("backToHome")}
      </Button>
    </div>
  )
}
