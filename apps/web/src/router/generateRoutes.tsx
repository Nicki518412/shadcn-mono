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

/** component 名 → lazy 页面组件；映射不到返回 null（页面未实现时菜单仍显示但点击 404，Task 20-22 补齐） */
function loadPage(component: string): LazyExoticComponent<ComponentType> | null {
  const loader = pageLoaders[`../features/${component}/page.tsx`] as PageModule | undefined
  if (!loader) return null
  return lazy(loader)
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
