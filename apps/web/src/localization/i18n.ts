import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enCommon from "./locales/en/common.json"
import enLogin from "./locales/en/login.json"
import zhCommon from "./locales/zh/common.json"
import zhLogin from "./locales/zh/login.json"

/** 支持的语言（key 为 i18next 语言码；nativeName 展示名；prefix 为语言切换菜单的简写徽标） */
export const SUPPORTED_LANGUAGES = [
  { key: "zh", nativeName: "中文", prefix: "中" },
  { key: "en", nativeName: "English", prefix: "EN" },
] as const

export type LanguageKey = (typeof SUPPORTED_LANGUAGES)[number]["key"]

/** 语言检测：localStorage 记忆优先，其次浏览器语言（zh 开头用中文，否则英文） */
function detectInitialLanguage(): LanguageKey {
  const stored = localStorage.getItem("language")
  if (stored === "zh" || stored === "en") return stored
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

// 类型安全 key：翻译 key 写错编译期报错（resources 形状随语言 JSON 自动同步）
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common"
    resources: {
      common: typeof zhCommon
      login: typeof zhLogin
    }
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { common: zhCommon, login: zhLogin },
    en: { common: enCommon, login: enLogin },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "zh",
  defaultNS: "common",
  ns: ["common", "login"],
  interpolation: { escapeValue: false },
})

export default i18n
