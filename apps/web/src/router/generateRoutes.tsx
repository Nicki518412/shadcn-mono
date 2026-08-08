import { lazy, Suspense } from "react"
import type { ComponentType, LazyExoticComponent } from "react"
import type { RouteObject } from "react-router"

import type { components } from "@/api/schema"
import { Spinner } from "@/components/ui/spinner"

type MenuNode = components["schemas"]["MenuNode"]

/**
 * 页面组件映射：`../features/<component>/page.tsx`（约定式路由，component 如 "system/user"）。
 * import.meta.glob 打包时静态扫描，新增页面后重新 dev/build 即生效。
 */
const pageLoaders = import.meta.glob("../features/**/page.tsx")

type PageModule = () => Promise<{ default: ComponentType }>

/** component 名 → lazy 页面组件；映射不到返回 null（导航过滤与路由生成共用该注册表）。 */
function loadPage(component: string): LazyExoticComponent<ComponentType> | null {
  const loader = pageLoaders[`../features/${component}/page.tsx`] as PageModule | undefined
  if (!loader) return null
  return lazy(loader)
}

function hasPage(component: string | null): component is string {
  return component !== null && pageLoaders[`../features/${component}/page.tsx`] !== undefined
}

/**
 * 移除没有实际页面模块的 MENU，并递归折叠因此变空的 DIR。
 * 权限码仍以服务端为准；这里只保证侧边栏不会展示无法访问的死链接。
 */
export function filterNavigableMenus(menus: MenuNode[]): MenuNode[] {
  const result: MenuNode[] = []
  for (const node of menus) {
    if (node.type === "BUTTON") continue
    if (node.type === "MENU") {
      if (node.path && hasPage(node.component)) result.push({ ...node, children: [] })
      continue
    }
    const children = filterNavigableMenus(node.children)
    if (children.length > 0) result.push({ ...node, children })
  }
  return result
}

/** navTree → 路由表：递归遍历，仅 MENU 且有 path+component 的节点生成懒加载路由，其余类型跳过 */
export function menuToRoutes(menus: MenuNode[]): RouteObject[] {
  const routes: RouteObject[] = []
  collectMenuRoutes(menus, routes)
  return routes
}

function collectMenuRoutes(nodes: MenuNode[], routes: RouteObject[]): void {
  for (const node of nodes) {
    if (node.type === "MENU" && node.path && node.component) {
      const Page = loadPage(node.component)
      if (!Page) continue
      routes.push({
        path: node.path,
        element: (
          <Suspense
            fallback={
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner /> 加载中…
              </div>
            }
          >
            <Page />
          </Suspense>
        ),
      })
    }
    collectMenuRoutes(node.children, routes)
  }
}
