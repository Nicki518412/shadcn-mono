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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useCreateAnnouncementMutation, useUpdateAnnouncementMutation } from "./useAnnouncements"
import type { AnnouncementCreateInput, AnnouncementItem } from "./useAnnouncements"

/** 新增/编辑公告 Dialog：标题 + 正文 + 发布状态（下架后首页横幅不展示） */
export function AnnouncementFormDialog({
  announcement,
  onClose,
}: {
  announcement?: AnnouncementItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("announcement")
  const isEdit = Boolean(announcement)
  const createMutation = useCreateAnnouncementMutation()
  const updateMutation = useUpdateAnnouncementMutation()

  const [title, setTitle] = useState(announcement?.title ?? "")
  const [content, setContent] = useState(announcement?.content ?? "")
  const [status, setStatus] = useState(announcement?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!title.trim()) {
      setError(t("titleRequired"))
      return
    }
    if (!content.trim()) {
      setError(t("contentRequired"))
      return
    }
    setError(null)
    const body: AnnouncementCreateInput = {
      title: title.trim(),
      content: content.trim(),
      status,
    }
    if (isEdit && announcement) {
      updateMutation.mutate({ id: announcement.id, body }, { onSuccess: () => { onClose(); } })
    } else {
      createMutation.mutate(body, { onSuccess: () => { onClose(); } })
    }
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
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{isEdit ? t("editDesc") : t("createDesc")}</DialogDescription>
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
              <FieldLabel htmlFor="ann-form-title">{t("titleLabel")}</FieldLabel>
              <FieldContent>
                <Input
                  id="ann-form-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                  }}
                  placeholder={t("titlePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="ann-form-content">{t("contentLabel")}</FieldLabel>
              <FieldContent>
                <Textarea
                  id="ann-form-content"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value)
                  }}
                  placeholder={t("contentPlaceholder")}
                  className="min-h-28"
                />
              </FieldContent>
            </Field>
            <Field orientation="horizontal" className="gap-2">
              <Switch
                id="ann-form-status"
                checked={status}
                onCheckedChange={setStatus}
              />
              <FieldLabel htmlFor="ann-form-status">{t("publishSwitch")}</FieldLabel>
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
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
