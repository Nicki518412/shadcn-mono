export type MenuType = "DIR" | "MENU" | "BUTTON"

export interface MenuNode {
  id: string
  parentId: string | null
  name: string
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
