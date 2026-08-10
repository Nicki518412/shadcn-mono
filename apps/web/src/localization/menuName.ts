import i18n from "./i18n"

/**
 * 菜单/角色展示名解析（数据级 i18n）：英文界面（en*）且配置了 nameEn 时展示英文名，
 * 否则回落数据库原文 name（业务数据不翻译，管理员自定义内容也统一走此规则）。
 */
export function menuDisplayName(node: { name: string; nameEn: string | null }): string {
  return i18n.language.startsWith("en") && node.nameEn ? node.nameEn : node.name
}

export function roleDisplayName(role: { name: string; nameEn: string | null }): string {
  return i18n.language.startsWith("en") && role.nameEn ? role.nameEn : role.name
}
