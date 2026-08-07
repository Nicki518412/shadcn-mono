import { useTheme } from "next-themes"
import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 主题切换按钮：按 resolvedTheme 在 Sun/Moon 间十字旋转渐变切换；点击在亮/暗间切换 */
export function ThemeToggle(): React.JSX.Element {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const label = isDark ? "切换到亮色主题" : "切换到暗色主题"
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative"
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(isDark ? "light" : "dark")
      }}
    >
      <SunIcon
        className={cn(
          "size-4 transition-all duration-300",
          isDark ? "rotate-0 scale-100" : "-rotate-90 scale-0",
        )}
      />
      <MoonIcon
        className={cn(
          "absolute inset-0 m-auto size-4 transition-all duration-300",
          isDark ? "rotate-90 scale-0" : "rotate-0 scale-100",
        )}
      />
    </Button>
  )
}
