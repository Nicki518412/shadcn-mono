import type { JSX } from "react"
import { useTranslation } from "react-i18next"
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
import { roleDisplayName } from "@/localization/menuName"
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
  const { t } = useTranslation("dashboard")
  const user = me?.user
  const roles = me?.roles ?? []
  const permissionCount = me?.permissionCodes.length ?? 0
  const menuCount = countMenus(me?.navTree ?? [])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("workspace")} description={t("welcome", { nickname: user?.nickname ?? "…" })} />

      <Card>
        <CardHeader>
          <CardTitle>{t("accountInfo")}</CardTitle>
          <CardDescription>{t("accountInfoDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <InfoItem label={t("username")} value={user?.username ?? "—"} />
            <InfoItem label={t("email")} value={user?.email ?? "—"} />
            <InfoItem label={t("phone")} value={user?.telephone ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("myRoles")}</CardTitle>
            <CardDescription>{t("myRolesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {roles.length > 0 ? (
              roles.map((role) => (
                <Badge key={role.id} variant="secondary">
                  {roleDisplayName(role)}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">{t("noRoles")}</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{t("permissionCodes")}</p>
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
              <p className="text-sm text-muted-foreground">{t("navMenus")}</p>
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
