import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { api, apiErrorMessage } from "@/api/client"
import { useAuth } from "@/auth/AuthProvider"
import type { components, paths } from "@/api/schema"
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
import { Separator } from "@/components/ui/separator"
import { ME_QUERY_KEY } from "@/router/guards"

/** PATCH /api/users/me 请求体（openapi-typescript 生成类型，随 schema.d.ts 自动同步） */
type MeUpdateInput = NonNullable<
  paths["/api/users/me"]["patch"]["requestBody"]
>["content"]["application/json"]

/**
 * 用户设置弹窗：登录人修改自己的个人资料（昵称/邮箱/手机号）。
 * - 邮箱/手机号留空 = 清空（后端 null 语义）；唯一冲突 409 直接展示
 * - 保存成功后失效 me 缓存（侧边栏昵称/用户菜单信息同步刷新）
 */
export function ProfileDialog({
  user,
  onClose,
}: {
  user: components["schemas"]["UserPublic"]
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("users")
  const queryClient = useQueryClient()
  const auth = useAuth()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(user.nickname)
  const [email, setEmail] = useState(user.email ?? "")
  const [telephone, setTelephone] = useState(user.telephone ?? "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!nickname.trim()) {
      setError(t("nicknameRequired"))
      return
    }
    if (newPassword && !currentPassword) {
      setError(t("currentPasswordRequired"))
      return
    }
    setError(null)
    setPending(true)
    const body: MeUpdateInput = {
      nickname: nickname.trim(),
      email: email.trim() === "" ? null : email.trim(),
      telephone: telephone.trim() === "" ? null : telephone.trim(),
    }
    try {
      await api<unknown>("/users/me", { method: "PATCH", body: JSON.stringify(body) })
      if (newPassword) {
        // 改密码成功后后端吊销全部 refresh token——主动登出并提示重新登录
        await api<unknown>("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
        })
        await auth.logout()
        toast.success(t("passwordChangedReLogin"))
        void navigate("/login")
        return
      }
      toast.success(t("profileUpdated"))
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      onClose()
    } catch (err: unknown) {
      setError(apiErrorMessage(err))
    } finally {
      setPending(false)
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
          <DialogTitle>{t("userSettings")}</DialogTitle>
          <DialogDescription>{t("profileDesc")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(event) => { void handleSubmit(event) }}>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-nickname">{t("nickname")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-nickname"
                  value={nickname}
                  onChange={(event) => {
                    setNickname(event.target.value)
                  }}
                  placeholder={t("nicknamePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">{t("email")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                  placeholder="name@example.com"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-telephone">{t("telephone")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-telephone"
                  value={telephone}
                  onChange={(event) => {
                    setTelephone(event.target.value)
                  }}
                  placeholder="13800138000"
                />
              </FieldContent>
            </Field>
          </FieldGroup>
          {/* 修改密码：留空不修改；填写新密码则必须验证当前密码 */}
          <Separator />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-current-password">{t("currentPassword")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value)
                  }}
                  placeholder={t("currentPasswordPlaceholder")}
                  autoComplete="current-password"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-new-password">{t("newPassword")}</FieldLabel>
              <FieldContent>
                <Input
                  id="profile-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value)
                  }}
                  placeholder={t("newPasswordPlaceholder")}
                  autoComplete="new-password"
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
              {pending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
