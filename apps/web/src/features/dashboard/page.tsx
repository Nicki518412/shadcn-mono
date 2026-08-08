import type { JSX } from "react"
import { MenuIcon, ShieldCheckIcon } from "lucide-react"

import type { components } from "@/api/schema"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PageHeader } from "@/components/business/PageHeader"
import { useMeQuery } from "@/router/guards"

type MenuNode = components["schemas"]["MenuNode"]

/** navTree 内 MENU 节点总数（递归；DIR/BUTTON 不计入导航菜单数） */
function countMenus(nodes: MenuNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === "MENU") count += 1
    count += countMenus(node.children)
  }
  return count
}

/** 账号信息定义列表项（标签弱化 / 值强调的 dl 布局） */
function InfoItem({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

/**
 * Dashboard：页头（欢迎语）+ 账号信息定义列表 + 角色 Badge + 权限统计卡片。
 * 守卫已拉取 me 查询（AppLayout/usePermissionCodes 共用缓存），此处直接消费；
 * me 类型上可为 null，字段统一 ?? 兜底（守卫已过，正常登录不会为 null）。
 */
export default function DashboardPage(): JSX.Element {
  const { data: me } = useMeQuery()
  const user = me?.user
  const roles = me?.roles ?? []
  const permissionCount = me?.permissionCodes.length ?? 0
  const menuCount = countMenus(me?.navTree ?? [])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="工作台" description={`欢迎回来，${user?.nickname ?? "…"}`} />

      <Card>
        <CardHeader>
          <CardTitle>账号信息</CardTitle>
          <CardDescription>当前登录账号的详细信息</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <InfoItem label="用户名" value={user?.username ?? "—"} />
            <InfoItem label="邮箱" value={user?.email ?? "—"} />
            <InfoItem label="手机号" value={user?.telephone ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>我的角色</CardTitle>
            <CardDescription>当前账号拥有的角色（权限按角色交集计算）</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {roles.length > 0 ? (
              roles.map((role) => (
                <Badge key={role.id} variant="secondary">
                  {role.name}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">未分配角色</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">按钮权限码</p>
              <p
                data-testid="stat-permission-count"
                className="text-3xl font-semibold tracking-tight tabular-nums"
              >
                {permissionCount}
              </p>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheckIcon className="size-4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">导航菜单</p>
              <p
                data-testid="stat-menu-count"
                className="text-3xl font-semibold tracking-tight tabular-nums"
              >
                {menuCount}
              </p>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MenuIcon className="size-4" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
