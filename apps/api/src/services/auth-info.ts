import { prisma } from "@repo/db"
import type { Menu } from "@repo/db"
import type { MenuNode } from "@repo/shared"
import { computeVisibleMenus } from "@repo/shared"
import { z } from "zod"
import { unauthorized } from "../lib/http-error.js"
import { toPublicUser, type PublicUser } from "../lib/schemas.js"

/** 用户完整权限信息（me 响应 / requirePermission 共用） */
export interface AuthInfo {
  user: PublicUser
  roles: { id: string; name: string; code: string }[]
  navTree: MenuNode[]
  permissionCodes: string[]
}

// Prisma Menu.type 为 string，zod 枚举校验收窄为 MenuType（禁止裸 as；脏数据抛 ZodError → onError 500）
const menuTypeSchema = z.enum(["DIR", "MENU", "BUTTON"])

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

/** 查询用户权限信息：user + roles + 全部角色授权菜单的严格交集 navTree + permissionCodes；调用方（authenticate）已保证用户存在 */
export async function getUserAuthInfo(userId: string): Promise<AuthInfo> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw unauthorized("账号不可用")

  const userRoles = await prisma.userRole.findMany({ where: { userId }, include: { role: true } })
  const roleIds = userRoles.map((ur) => ur.roleId)
  const roles = userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name, code: ur.role.code }))

  const [roleMenus, menus] = await Promise.all([
    roleIds.length > 0 ? prisma.roleMenu.findMany({ where: { roleId: { in: roleIds } } }) : Promise.resolve([]),
    prisma.menu.findMany({ orderBy: { sort: "asc" } }),
  ])
  // 每角色一个授权 menuId 数组（交集为集合运算，数组内顺序无关）
  const roleMenuIdsList = roleIds.map((rid) => roleMenus.filter((rm) => rm.roleId === rid).map((rm) => rm.menuId))
  const visible = computeVisibleMenus(roleMenuIdsList, menus.map(toMenuNode))

  return { user: toPublicUser(user), roles, navTree: visible.navTree, permissionCodes: [...visible.permissionCodes] }
}
