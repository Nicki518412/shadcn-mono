import type { MenuNode, VisibleMenus } from "./types.js"

/** 从扁平节点列表构建排序后的树（不修改入参）。 */
export function buildTree(nodes: MenuNode[], parentId: string | null = null): MenuNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.sort - b.sort)
    .map((n) => ({ ...n, children: buildTree(nodes, n.id) }))
}

/** 收集节点自身及其全部祖先 id（祖先补全）。 */
function collectAncestorIds(id: string, byId: Map<string, MenuNode>, acc: Set<string>): void {
  let current = byId.get(id)
  while (current !== undefined) {
    acc.add(current.id)
    if (current.parentId === null) break
    current = byId.get(current.parentId)
  }
}

/** 空目录折叠：递归移除无可见子孙的目录（含祖先补全拉入的目录）。先折叠子层再过滤，保证中间目录变空壳后也被移除。 */
function pruneEmptyDirs(nodes: MenuNode[]): MenuNode[] {
  return nodes
    .map((n) => ({ ...n, children: pruneEmptyDirs(n.children) }))
    .filter((n) => n.type !== "DIR" || n.children.length > 0)
}

/**
 * 计算用户可见菜单：所有角色授权菜单集合的严格交集。
 * - 任一角色为空集合或无角色 ⇒ 无任何权限
 * - 导航树 = 交集内非 BUTTON 节点 + 祖先补全（保证导航可达），空目录折叠，同层按 sort 升序
 * - permissionCodes = 交集内所有节点（MENU + BUTTON）的 permission 非空集合
 */
export function computeVisibleMenus(
  roleMenuIdsList: string[][],
  allMenus: MenuNode[],
): VisibleMenus {
  const byId = new Map(allMenus.map((n) => [n.id, n]))

  // 严格交集：空列表 → 空集
  if (roleMenuIdsList.length === 0) {
    return { navTree: [], permissionCodes: new Set<string>() }
  }

  let inter = new Set(roleMenuIdsList[0] ?? [])
  for (const ids of roleMenuIdsList.slice(1)) {
    const next = new Set<string>()
    for (const id of ids) {
      if (inter.has(id)) next.add(id)
    }
    inter = next
  }

  const interNodes = [...inter]
    .map((id) => byId.get(id))
    .filter((n): n is MenuNode => n !== undefined)

  // permissionCodes = 交集内所有节点（MENU+BUTTON）的 permission 非空集合
  const permissionCodes = new Set<string>()
  for (const n of interNodes) {
    if (n.permission !== null) permissionCodes.add(n.permission)
  }

  // 导航树 = 交集内非 BUTTON 节点 + 祖先补全
  const navIds = new Set<string>()
  for (const n of interNodes) {
    if (n.type !== "BUTTON") {
      collectAncestorIds(n.id, byId, navIds)
    }
  }

  const navNodes = [...navIds]
    .map((id) => byId.get(id))
    .filter((n): n is MenuNode => n !== undefined)

  return { navTree: pruneEmptyDirs(buildTree(navNodes)), permissionCodes }
}
