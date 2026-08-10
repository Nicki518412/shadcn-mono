import { useTranslation } from "react-i18next"
import { GlobeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SUPPORTED_LANGUAGES } from "@/localization/i18n"

/** 语言切换：顶栏/登录页右上角（DropdownMenu 列出支持语言，选择即切换并持久化） */
export function LanguageToggle(): React.JSX.Element {
  const { i18n, t } = useTranslation()
  const current =
    SUPPORTED_LANGUAGES.find((lang) => i18n.language.startsWith(lang.key)) ??
    SUPPORTED_LANGUAGES[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t("switchLanguage")} title={t("switchLanguage")} />
        }
      >
        <GlobeIcon className="size-4" />
        <span className="sr-only">{current.nativeName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Label 必须包在 Group 内（Base UI 1.7 组规范）；标题显示当前语言名（语言菜单不翻译自身） */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{current.nativeName}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.key}
            onClick={() => {
              localStorage.setItem("language", lang.key)
              void i18n.changeLanguage(lang.key)
            }}
          >
            <span className="w-6 text-xs text-muted-foreground">{lang.prefix}</span>
            {lang.nativeName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
