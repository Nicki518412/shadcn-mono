import type { JSX } from "react"

import type { components } from "@/api/schema"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

/**
 * Dashboard（Task 23）：欢迎卡片 + 账号信息 + 角色 Badge + 权限统计。
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
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>欢迎回来，{user?.nickname ?? "…"}</CardTitle>
          <CardDescription>当前登录账号信息</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-muted-foreground">
          <p>用户名：{user?.username ?? "—"}</p>
          <p>邮箱：{user?.email ?? "—"}</p>
          <p>手机号：{user?.telephone ?? "—"}</p>
        </CardContent>
      </Card>
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
            <span className="text-muted-foreground">未分配角色</span>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>权限统计</CardTitle>
          <CardDescription>服务端按角色交集下发</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-10">
          <div>
            <p className="text-2xl font-semibold text-foreground">{permissionCount}</p>
            <p className="text-muted-foreground">按钮权限码</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-foreground">{menuCount}</p>
            <p className="text-muted-foreground">导航菜单</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
