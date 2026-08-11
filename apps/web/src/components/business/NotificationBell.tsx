import { useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import { BellIcon, CheckCheckIcon } from "lucide-react"

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
  useNotificationsQuery,
  useReadAllNotificationsMutation,
  useReadNotificationMutation,
  useUnreadCountQuery,
} from "@/features/system/notifications/useNotifications"
import { cn } from "@/lib/utils"
import i18n from "@/localization/i18n"

/** 时间展示跟随界面语言（同各管理页 formatDateTime 惯例） */
function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(i18n.language === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/**
 * 顶栏消息中心铃铛：未读数徽标 + 最近 5 条下拉预览 + 全部已读 + 查看全部。
 * - 个人数据接口仅要求登录（无权限码），GUEST 等低权限角色同样可用
 * - 下拉打开时刷新未读数与最近列表；点击条目标记已读（列表同步失效）
 * - 未读数 60s 轮询 + 窗口聚焦刷新（TanStack Query 默认）兜底
 */
export function NotificationBell(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const unreadQuery = useUnreadCountQuery()
  const recentQuery = useNotificationsQuery(1, 5)
  const readMutation = useReadNotificationMutation()
  const readAllMutation = useReadAllNotificationsMutation()

  const unreadCount = unreadQuery.data?.count ?? 0
  const recent = recentQuery.data?.list ?? []

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // 打开时刷新未读数与最近列表（保证预览与徽标即时，不等 60s 轮询）
        if (next) {
          void unreadQuery.refetch()
          void recentQuery.refetch()
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t("notifications")} />
        }
      >
        <BellIcon />
        {/* 未读徽标：红点 + 数字（99+ 封顶） */}
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
            {unreadCount > 99 ? "99+" : String(unreadCount)}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-sm font-medium">{t("notifications")}</span>
              {unreadCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    readAllMutation.mutate()
                  }}
                  disabled={readAllMutation.isPending}
                >
                  <CheckCheckIcon className="size-3.5" />
                  {t("notificationsAllRead")}
                </Button>
              )}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t("notificationsEmpty")}
          </div>
        ) : (
          recent.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex-col items-start gap-0.5 px-3 py-2"
              disabled={notification.isRead}
              onClick={() => {
                readMutation.mutate(notification.id)
              }}
            >
              <span className="flex w-full items-center gap-1.5 text-sm">
                {!notification.isRead && (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <span
                  className={cn(
                    "truncate",
                    notification.isRead ? "text-muted-foreground" : "font-medium",
                  )}
                >
                  {notification.title}
                </span>
              </span>
              <span className="w-full truncate pl-3 text-xs text-muted-foreground/70">
                {formatTime(notification.createdAt)}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void navigate("/system/notification")
          }}
          className="justify-center text-sm text-muted-foreground"
        >
          {t("notificationsViewAll")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
