export type MenuType = "DIR" | "MENU" | "BUTTON"

export interface MenuNode {
  id: string
  parentId: string | null
  nameZh: string
  /** 英文名称（en 语言展示，未填回落 nameZh） */
  nameEn: string | null
  type: MenuType
  path: string | null
  component: string | null
  icon: string | null
  permission: string | null
  sort: number
  status: boolean
  children: MenuNode[]
}

export interface VisibleMenus {
  navTree: MenuNode[]
  permissionCodes: Set<string>
}
