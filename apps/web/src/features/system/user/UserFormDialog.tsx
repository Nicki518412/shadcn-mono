import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { roleDisplayName } from "@/localization/menuName"
import { useRolesListQuery } from "../role/useRoles"
import { useCreateUserMutation, useUpdateUserMutation } from "./useUsers"
import type { UserCreateInput, UserListItem, UserUpdateInput } from "./useUsers"

/**
 * 新增/编辑用户 Dialog（页面按条件挂载，每次打开全新初始化，无需重置逻辑）：
 * - 新增：POST /api/users（username/password 必填）
 * - 编辑：PATCH /api/users/{id}（username 禁用；password 留空则不修改；
 *   email/telephone 留空显式传 null 清空；status/roleIds 全量提交）
 * 角色多选为 Checkbox 列表（角色数量少，比 Select 多选简单且免去 Command 依赖）。
 */
export function UserFormDialog({
  user,
  onClose,
}: {
  user?: UserListItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("users")
  const isEdit = Boolean(user)
  const rolesQuery = useRolesListQuery()
  const createMutation = useCreateUserMutation()
  const updateMutation = useUpdateUserMutation()

  const [username, setUsername] = useState(user?.username ?? "")
  const [nickname, setNickname] = useState(user?.nickname ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [telephone, setTelephone] = useState(user?.telephone ?? "")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState(user?.status ?? true)
  const [roleIds, setRoleIds] = useState<Set<string>>(
    () => new Set(user?.roles.map((role) => role.id) ?? []),
  )
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  function toggleRole(roleId: string, checked: boolean): void {
    setRoleIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(roleId)
      else next.delete(roleId)
      return next
    })
  }

  function validate(): string | null {
    if (username.trim().length < 2) return t("usernameMinLength")
    if (!nickname.trim()) return t("nicknameRequired")
    if (!isEdit && password.length < 8) return t("passwordMinLength")
    return null
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    setError(null)
    if (isEdit && user) {
      const body: UserUpdateInput = {
        nickname: nickname.trim(),
        email: email.trim() === "" ? null : email.trim(),
        telephone: telephone.trim() === "" ? null : telephone.trim(),
        status,
        roleIds: [...roleIds],
      }
      if (password) body.password = password
      updateMutation.mutate({ id: user.id, body }, { onSuccess: () => { onClose(); } })
    } else {
      const body: UserCreateInput = {
        username: username.trim(),
        password,
        nickname: nickname.trim(),
      }
      if (email.trim()) body.email = email.trim()
      if (telephone.trim()) body.telephone = telephone.trim()
      if (roleIds.size > 0) body.roleIds = [...roleIds]
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
      {/* StickyFooter 模式（参考 shadcn dialog-sticky-footer）：Header/Footer 固定，
          内容区独立滚动（max-h-[50vh] + no-scrollbar 隐藏滚动条），弹窗不再整窗滚动 */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("addUser")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDesc") : t("createDesc")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="-mx-4 max-h-[50vh] overflow-y-auto px-4 no-scrollbar">
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
              <FieldLabel htmlFor="user-form-username">{t("username")}</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                  }}
                  disabled={isEdit}
                  placeholder={t("usernamePlaceholder")}
                />
                {isEdit && <FieldDescription>{t("usernameImmutable")}</FieldDescription>}
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-form-nickname">{t("nickname")}</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-nickname"
                  value={nickname}
                  onChange={(event) => {
                    setNickname(event.target.value)
                  }}
                  placeholder={t("nicknamePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-form-email">{t("email")}</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-email"
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
              <FieldLabel htmlFor="user-form-telephone">{t("telephone")}</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-telephone"
                  value={telephone}
                  onChange={(event) => {
                    setTelephone(event.target.value)
                  }}
                  placeholder="13800138000"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-form-password">{t("password")}</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                  }}
                  placeholder={isEdit ? t("passwordPlaceholderEdit") : t("passwordPlaceholderCreate")}
                  autoComplete="new-password"
                />
              </FieldContent>
            </Field>
            <Field orientation="horizontal" className="gap-2">
              <Switch
                id="user-form-status"
                checked={status}
                onCheckedChange={setStatus}
              />
              <FieldLabel htmlFor="user-form-status">{t("enabled")}</FieldLabel>
            </Field>
            <Field>
              <FieldLabel>{t("roles")}</FieldLabel>
              <FieldContent>
                {rolesQuery.isPending ? (
                  <span className="text-sm text-muted-foreground">{t("rolesLoading")}</span>
                ) : rolesQuery.isError ? (
                  <span className="text-sm text-destructive">{t("rolesLoadError")}</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {rolesQuery.data.map((role) => (
                      <div key={role.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`user-form-role-${role.id}`}
                          checked={roleIds.has(role.id)}
                          onCheckedChange={(checked) => { toggleRole(role.id, checked); }}
                        />
                        <Label
                          htmlFor={`user-form-role-${role.id}`}
                          className="text-sm font-normal"
                        >
                          {roleDisplayName(role)}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </FieldContent>
            </Field>
          </FieldGroup>
          </div>
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
