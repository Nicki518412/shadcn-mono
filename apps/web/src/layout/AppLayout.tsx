import { Fragment, useMemo } from "react"
import type { JSX } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  BellIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  LogOutIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"

import type { components } from "@/api/schema"
import { useAuth } from "@/auth/AuthProvider"
import ErrorBoundary from "@/components/business/ErrorBoundary"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
import { iconByName } from "@/lib/icons"
import { cn } from "@/lib/utils"
import ForbiddenPage from "@/pages/ForbiddenPage"
import NotFoundPage from "@/pages/NotFoundPage"
import { ME_QUERY_KEY, useMeQuery } from "@/router/guards"
import { menuToRoutes } from "@/router/generateRoutes"

type MenuNode = components["schemas"]["MenuNode"]

/**
 * MENU → SidebarMenuButton 渲染为 NavLink（end：对齐 aria-current 与视觉精确匹配，
 * 避免 to="/" 时前缀匹配导致的常驻高亮）；isActive 驱动 data-active 高亮，
 * 另加左侧竖向指示条（after 伪元素）强化激活态
 */
function MenuLink({ node }: { node: MenuNode }): JSX.Element | null {
  const location = useLocation()
  const isActive = location.pathname === node.path
  if (!node.path) return null
  const Icon = iconByName(node.icon)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<NavLink to={node.path} end />}
        isActive={isActive}
        className="relative after:absolute after:inset-y-1.5 after:left-0 after:w-0.5 after:rounded-full after:bg-sidebar-primary after:opacity-0 data-active:after:opacity-100"
      >
        {Icon ? <Icon className="size-4 shrink-0" /> : null}
        <span>{node.name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** DIR 子级 MENU：SidebarMenuSubButton 渲染为 NavLink（缩进 + 左侧边框样式） */
function SubMenuLink({ node }: { node: MenuNode }): JSX.Element | null {
  const location = useLocation()
  if (!node.path) return null
  const Icon = iconByName(node.icon)
  return (
    <SidebarMenuSubButton
      render={<NavLink to={node.path} end />}
      isActive={location.pathname === node.path}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span>{node.name}</span>
    </SidebarMenuSubButton>
  )
}

/** DIR：Collapsible 分组（可折叠，shadcn 官方组件），trigger 为 SidebarMenuButton，面板为 SidebarMenuSub */
function DirGroup({ node }: { node: MenuNode }): JSX.Element {
  const Icon = iconByName(node.icon) ?? FolderIcon
  return (
    <Collapsible className="group/collapsible" defaultOpen>
      <SidebarMenuItem>
        <CollapsibleTrigger render={<SidebarMenuButton />}>
          <Icon className="size-4 shrink-0" />
          <span>{node.name}</span>
          <ChevronRightIcon className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
        </CollapsibleTrigger>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub>
          {node.children.map((child) => (
            <SubMenuEntry key={child.id} node={child} />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
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

/**
 * 侧边栏导航：顶层 MENU → 固定 "总览" 组；顶层 DIR → 可折叠分组（Collapsible，
 * 默认展开，点击目录名收起/展开——管理端目录惯例）；嵌套 DIR 同样可折叠递归。
 */
function Navigation({ navTree }: { navTree: MenuNode[] }): JSX.Element {
  const overview = navTree.filter((node) => node.type === "MENU")
  const dirGroups = navTree.filter((node) => node.type === "DIR")
  return (
    <>
      {overview.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel>总览</SidebarGroupLabel>
          <SidebarMenu>
            {overview.map((node) => (
              <MenuLink key={node.id} node={node} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      {dirGroups.length > 0 && (
        <SidebarGroup>
          <SidebarMenu>
            {dirGroups.map((node) => (
              <DirGroup key={node.id} node={node} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  )
}

/** 沿 navTree 查找 pathname 对应 MENU 的祖先链（含自身）；未命中返回 null */
function findMenuTrail(
  nodes: MenuNode[],
  pathname: string,
  ancestors: MenuNode[] = [],
): MenuNode[] | null {
  for (const node of nodes) {
    if (node.type === "MENU" && node.path === pathname) return [...ancestors, node]
    const found = findMenuTrail(node.children, pathname, [...ancestors, node])
    if (found) return found
  }
  return null
}

/** 顶栏面包屑：祖先后缀链（如 系统管理 / 用户管理）；无匹配路径显示 "控制台" 兜底 */
function Breadcrumb({ trail }: { trail: MenuNode[] | null }): JSX.Element {
  if (!trail || trail.length === 0) {
    return <span className="text-sm font-medium">控制台</span>
  }
  return (
    <nav aria-label="面包屑导航" className="flex min-w-0 items-center gap-1.5 text-sm">
      {trail.map((node, index) => {
        const isLast = index === trail.length - 1
        return (
          <Fragment key={node.id}>
            {index > 0 && (
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
            )}
            <span
              className={cn(
                "truncate",
                isLast ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {node.name}
            </span>
          </Fragment>
        )
      })}
    </nav>
  )
}

/** 主题切换按钮：按 resolvedTheme 在 Sun/Moon 间十字旋转渐变切换；点击在亮/暗间切换 */
function ThemeToggle(): JSX.Element {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const label = isDark ? "切换到亮色主题" : "切换到暗色主题"
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative"
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(isDark ? "light" : "dark")
      }}
    >
      <SunIcon
        className={cn(
          "size-4 transition-all duration-300",
          isDark ? "rotate-0 scale-100" : "-rotate-90 scale-0",
        )}
      />
      <MoonIcon
        className={cn(
          "absolute inset-0 m-auto size-4 transition-all duration-300",
          isDark ? "rotate-90 scale-0" : "rotate-0 scale-100",
        )}
      />
    </Button>
  )
}

export default function AppLayout(): JSX.Element {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()
  const { data: me } = useMeQuery()

  // 路由在 me 数据就绪后生成（navTree 变化 → 重建）；RequireAuth 已拉取同 key 查询，共享缓存
  const navTree = me?.navTree ?? []
  const routes = useMemo(() => menuToRoutes(navTree), [navTree])
  const trail = useMemo(
    () => findMenuTrail(navTree, location.pathname),
    [navTree, location.pathname],
  )

  async function handleLogout(): Promise<void> {
    await auth.logout()
    // 清掉 me 缓存，避免退出后旧用户数据残留（同一 QueryClient 跨登录复用）
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
    void navigate("/login")
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        {/* 品牌区：logo 标记 + 字标 + 副标题；折叠为 icon 模式时仅保留居中的 logo */}
        <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-0">
          <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <ShieldIcon className="size-4" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold leading-tight">Admin Console</p>
              <p className="truncate text-xs leading-tight text-sidebar-foreground/60">
                RBAC 管理后台
              </p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <Navigation navTree={navTree} />
        </SidebarContent>
        {/* 用户区（shadcn sidebar-15 UserMenu 官方区块形态）：SidebarMenuButton size="lg" 舒展尺寸、
            打开态高亮（data-[state=open]）、grid 两行文本、ChevronsUpDown 锚点；全部使用 shadcn 组件 */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      className="gap-3 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    />
                  }
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {me?.user.nickname.slice(0, 1) ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{me?.user.nickname ?? "…"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {me?.user.email ?? me?.user.username ?? ""}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-48">
                  {/* Label 必须包在 Group 内：Base UI 1.7 的 GroupLabel 无 Group 上下文会抛
                      MenuGroupContext is missing → 渲染错误卸载整树（曾导致点击用户菜单白屏） */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {me?.user.nickname ?? "…"}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {me?.user.username ?? ""}
                        </span>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
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
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <ThemeToggle />
          {/* 消息通知：暂无功能，占位按钮（后续接入通知中心） */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="消息通知（即将上线）"
            title="消息通知（即将上线）"
            disabled
          >
            <BellIcon className="size-4" />
          </Button>
          <Breadcrumb trail={trail} />
        </header>
        <main className="flex-1 overflow-auto p-4">
          {/* 内层容器统一页面留白与最大宽度（大屏限宽保持版式比例） */}
          <div className="mx-auto w-full max-w-7xl px-6 py-6">
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
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
