import { useTheme } from "next-themes"
import { useTranslation } from "react-i18next"
import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 主题切换过渡时长：与 index.css 的 html.theme-transition 规则一致 */
const THEME_TRANSITION_MS = 300

/** 主题切换按钮：按 resolvedTheme 在 Sun/Moon 间十字旋转渐变切换；点击在亮/暗间切换。
 * 切换瞬间给 <html> 挂 theme-transition class（配合 index.css 的全量颜色过渡），
 * 过渡结束后移除——只在切换时有动画，不影响日常 hover 等交互性能。 */
export function ThemeToggle(): React.JSX.Element {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useTranslation()
  const isDark = resolvedTheme === "dark"
  const label = isDark ? t("themeLight") : t("themeDark")
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative"
      aria-label={label}
      title={label}
      onClick={() => {
        document.documentElement.classList.add("theme-transition")
        setTheme(isDark ? "light" : "dark")
        window.setTimeout(() => {
          document.documentElement.classList.remove("theme-transition")
        }, THEME_TRANSITION_MS)
      }}
    >
      <SunIcon
        className={cn(
          "transition-all duration-300",
          isDark ? "rotate-0 scale-100" : "-rotate-90 scale-0",
        )}
      />
      <MoonIcon
        className={cn(
          "absolute inset-0 m-auto transition-all duration-300",
          isDark ? "rotate-90 scale-0" : "rotate-0 scale-100",
        )}
      />
    </Button>
  )
}
