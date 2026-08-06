import { prisma } from "@repo/db"
import type { Menu } from "@repo/db"
import type { MenuNode } from "@repo/shared"
import { computeVisibleMenus } from "@repo/shared"
import { menuTypeSchema, type PublicUser } from "../lib/schemas.js"

/** 用户完整权限信息（me 响应 / requirePermission 共用） */
export interface AuthInfo {
  user: PublicUser
  roles: { id: string; name: string; code: string }[]
  navTree: MenuNode[]
  permissionCodes: string[]
}

// Prisma Menu.type 为 string，zod 枚举校验收窄为 MenuType（menuTypeSchema 定义见 lib/schemas.ts，auth-info 与 menus 路由共用）

/** Prisma Menu → MenuNode（children 置空，computeVisibleMenus 内部 buildTree 组装） */
function toMenuNode(menu: Menu): MenuNode {
  return {
    id: menu.id,
    parentId: menu.parentId,
    name: menu.name,
    type: menuTypeSchema.parse(menu.type),
    path: menu.path,
    component: menu.component,
    icon: menu.icon,
    permission: menu.permission,
    sort: menu.sort,
    status: menu.status,
    children: [],
  }
}

/**
 * 查询用户权限信息：roles + 全部授权角色的严格交集 navTree + permissionCodes。
 * user 由调用方传入（authenticate 已查询并保证存在且启用，避免重复查询）；禁用角色/禁用菜单不参与计算。
 */
export async function getUserAuthInfo(userId: string, user: PublicUser): Promise<AuthInfo> {
  const userRoles = await prisma.userRole.findMany({ where: { userId }, include: { role: true } })
  // 禁用角色不参与权限计算（授权无效）
  const activeRoles = userRoles.filter((ur) => ur.role.status)
  const roles = activeRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name, code: ur.role.code }))
  const roleIds = activeRoles.map((ur) => ur.roleId)

  const [roleMenus, menus] = await Promise.all([
    roleIds.length > 0 ? prisma.roleMenu.findMany({ where: { roleId: { in: roleIds } } }) : Promise.resolve([]),
    // 禁用菜单不进导航/权限码
    prisma.menu.findMany({ where: { status: true }, orderBy: { sort: "asc" } }),
  ])
  // 每角色一个授权 menuId 数组（交集为集合运算，数组内顺序无关）
  const roleMenuIdsList = roleIds.map((rid) => roleMenus.filter((rm) => rm.roleId === rid).map((rm) => rm.menuId))
  const visible = computeVisibleMenus(roleMenuIdsList, menus.map(toMenuNode))

  return { user, roles, navTree: visible.navTree, permissionCodes: [...visible.permissionCodes] }
}
