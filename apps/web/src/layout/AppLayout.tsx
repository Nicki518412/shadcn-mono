import { useMemo } from "react"
import type { JSX } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router"
import { Collapsible } from "@base-ui/react/collapsible"
import { ChevronRightIcon, LogOutIcon } from "lucide-react"

import type { components } from "@/api/schema"
import { useAuth } from "@/auth/AuthProvider"
import ErrorBoundary from "@/components/business/ErrorBoundary"
import { Button } from "@/components/ui/button"
import { ME_QUERY_KEY, useMeQuery } from "@/router/guards"
import { menuToRoutes } from "@/router/generateRoutes"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import ForbiddenPage from "@/pages/ForbiddenPage"
import NotFoundPage from "@/pages/NotFoundPage"

type MenuNode = components["schemas"]["MenuNode"]

/**
 * MENU → SidebarMenuButton 渲染为 NavLink（end：对齐 aria-current 与视觉精确匹配，
 * 避免 to="/" 时前缀匹配导致的常驻高亮）；isActive 驱动 data-active 高亮
 */
function MenuLink({ node }: { node: MenuNode }): JSX.Element | null {
  const location = useLocation()
  if (!node.path) return null
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={node.path} end />}
        isActive={location.pathname === node.path}
      >
        <span>{node.name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** DIR 子级 MENU：SidebarMenuSubButton 渲染为 NavLink（缩进 + 左侧边框样式） */
function SubMenuLink({ node }: { node: MenuNode }): JSX.Element | null {
  const location = useLocation()
  if (!node.path) return null
  return (
    <SidebarMenuSubButton
      render={<NavLink to={node.path} end />}
      isActive={location.pathname === node.path}
    >
      <span>{node.name}</span>
    </SidebarMenuSubButton>
  )
}

/** DIR：Collapsible 分组（可折叠），trigger 为 SidebarMenuButton，面板为 SidebarMenuSub */
function DirGroup({ node }: { node: MenuNode }): JSX.Element {
  return (
    <Collapsible.Root className="group/collapsible" defaultOpen>
      <SidebarMenuItem>
        <Collapsible.Trigger render={<SidebarMenuButton />}>
          <span>{node.name}</span>
          <ChevronRightIcon className="ml-auto transition-transform group-data-[open]/collapsible:rotate-90" />
        </Collapsible.Trigger>
      </SidebarMenuItem>
      <Collapsible.Panel>
        <SidebarMenuSub>
          {node.children.map((child) => (
            <SubMenuEntry key={child.id} node={child} />
          ))}
        </SidebarMenuSub>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/** DIR 子级条目：MENU → 子菜单链接；BUTTON → 不渲染；DIR → 纯分组标签 + 递归子菜单（种子数据无此形状，兜底） */
function SubMenuEntry({ node }: { node: MenuNode }): JSX.Element | null {
  if (node.type === "BUTTON") return null
  if (node.type === "DIR") {
    return (
      <SidebarMenuSubItem>
        <span className="flex h-7 items-center px-2 text-xs font-medium text-sidebar-foreground/70">
          {node.name}
        </span>
        <SidebarMenuSub>
          {node.children.map((child) => (
            <SubMenuEntry key={child.id} node={child} />
          ))}
        </SidebarMenuSub>
      </SidebarMenuSubItem>
    )
  }
  return (
    <SidebarMenuSubItem>
      <SubMenuLink node={node} />
    </SidebarMenuSubItem>
  )
}

/** 递归渲染 navTree：MENU → 链接；DIR → 可折叠分组；BUTTON → 跳过 */
function MenuList({ nodes }: { nodes: MenuNode[] }): JSX.Element {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === "BUTTON") return null
        if (node.type === "DIR") return <DirGroup key={node.id} node={node} />
        return <MenuLink key={node.id} node={node} />
      })}
    </>
  )
}

export default function AppLayout(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: me } = useMeQuery()

  // 路由在 me 数据就绪后生成（navTree 变化 → 重建）；RequireAuth 已拉取同 key 查询，共享缓存
  const navTree = me?.navTree ?? []
  const routes = useMemo(() => menuToRoutes(navTree), [navTree])

  async function handleLogout(): Promise<void> {
    await auth.logout()
    // 清掉 me 缓存，避免退出后旧用户数据残留（同一 QueryClient 跨登录复用）
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
    void navigate("/login")
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="px-2 py-1 text-sm font-semibold">Admin Console</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <MenuList nodes={navTree} />
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                <span className="max-w-40 truncate">{me?.user.nickname ?? "…"}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{me?.user.nickname ?? "…"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    void handleLogout()
                  }}
                >
                  <LogOutIcon />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">
          {/* 错误边界只包内层 Routes：页面渲染抛错时兜底，侧边栏/顶栏与登录流程不受影响 */}
          <ErrorBoundary>
            <Routes>
              {routes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              {/* 403 兜底：权限交集已过滤导航，此路由供错误边界/未来扩展或手动访问使用 */}
              <Route path="/403" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
