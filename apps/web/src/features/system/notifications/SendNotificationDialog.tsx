import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useUsersQuery } from "@/features/system/user/useUsers"
import { useCreateNotificationMutation } from "./useNotifications"

/**
 * 发送通知 Dialog：给指定用户发站内通知（按钮由 system:notification:create 权限码门控）。
 * 接收用户为单选下拉（用户列表第一页 100 条，足够管理端规模；后端 404 兜底）。
 */
export function SendNotificationDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation("notifications")
  const createMutation = useCreateNotificationMutation()
  const usersQuery = useUsersQuery(1, 100, "")
  const users = usersQuery.data?.list ?? []

  const [targetUserId, setTargetUserId] = useState("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending
  const mutationError = createMutation.error

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!targetUserId) {
      setError(t("targetUserRequired"))
      return
    }
    if (!title.trim()) {
      setError(t("titleRequired"))
      return
    }
    if (!content.trim()) {
      setError(t("contentRequired"))
      return
    }
    setError(null)
    createMutation.mutate(
      { targetUserId, title: title.trim(), content: content.trim() },
      { onSuccess: () => { onClose(); } },
    )
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sendTitle")}</DialogTitle>
          <DialogDescription>{t("sendDesc")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {mutationError && (
            <p role="alert" className="text-sm text-destructive">
              {mutationError.message}
            </p>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="notif-form-user">{t("targetUser")}</FieldLabel>
              <FieldContent>
                <Select
                  value={targetUserId}
                  onValueChange={(value) => {
                    if (value !== null) setTargetUserId(value)
                  }}
                >
                  <SelectTrigger id="notif-form-user" className="w-full">
                    <SelectValue>
                      {(value) =>
                        users.find((user) => user.id === value)?.nickname ??
                        t("targetUserPlaceholder")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id} label={user.nickname}>
                        <span className="flex items-center gap-2">
                          <span>{user.nickname}</span>
                          <span className="text-xs text-muted-foreground">@{user.username}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="notif-form-title">{t("titleLabel")}</FieldLabel>
              <FieldContent>
                <Input
                  id="notif-form-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                  }}
                  placeholder={t("titlePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="notif-form-content">{t("contentLabel")}</FieldLabel>
              <FieldContent>
                <Textarea
                  id="notif-form-content"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value)
                  }}
                  placeholder={t("contentPlaceholder")}
                  className="min-h-24"
                />
              </FieldContent>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
              className="h-9"
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="h-9">
              {pending ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
