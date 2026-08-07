import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"

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
    if (username.trim().length < 2) return "用户名至少 2 个字符"
    if (!nickname.trim()) return "请输入昵称"
    if (!isEdit && password.length < 8) return "密码至少 8 个字符"
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
      <DialogContent className="p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑用户" : "新增用户"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改用户信息；密码留空则不修改" : "创建新的系统用户"}
          </DialogDescription>
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
              <FieldLabel htmlFor="user-form-username">用户名</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                  }}
                  disabled={isEdit}
                  placeholder="登录用户名"
                />
                {isEdit && <FieldDescription>用户名创建后不可修改</FieldDescription>}
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-form-nickname">昵称</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-nickname"
                  value={nickname}
                  onChange={(event) => {
                    setNickname(event.target.value)
                  }}
                  placeholder="显示昵称"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-form-email">邮箱</FieldLabel>
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
              <FieldLabel htmlFor="user-form-telephone">手机号</FieldLabel>
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
              <FieldLabel htmlFor="user-form-password">密码</FieldLabel>
              <FieldContent>
                <Input
                  id="user-form-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                  }}
                  placeholder={isEdit ? "留空则不修改" : "至少 8 个字符"}
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
              <FieldLabel htmlFor="user-form-status">启用</FieldLabel>
            </Field>
            <Field>
              <FieldLabel>角色</FieldLabel>
              <FieldContent>
                {rolesQuery.isPending ? (
                  <span className="text-sm text-muted-foreground">角色加载中…</span>
                ) : rolesQuery.isError ? (
                  <span className="text-sm text-destructive">角色加载失败</span>
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
                          {role.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
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
              取消
            </Button>
            <Button type="submit" disabled={pending} className="h-9">
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
