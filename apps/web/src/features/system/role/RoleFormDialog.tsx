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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useCreateRoleMutation, useUpdateRoleMutation } from "./useRoles"
import type { RoleCreateInput, RoleListItem, RoleUpdateInput } from "./useRoles"

/**
 * 新增/编辑角色 Dialog（页面按条件挂载，每次打开全新初始化，无需重置逻辑）：
 * - 新增：POST /api/roles（name/code 必填）
 * - 编辑：PATCH /api/roles/{id}（code 允许修改——后端 PATCH 校验唯一并统一大写；
 *   description 留空显式传 null 清空）
 */
export function RoleFormDialog({
  role,
  onClose,
}: {
  role?: RoleListItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("roles")
  const isEdit = Boolean(role)
  const createMutation = useCreateRoleMutation()
  const updateMutation = useUpdateRoleMutation()

  const [name, setName] = useState(role?.name ?? "")
  const [code, setCode] = useState(role?.code ?? "")
  const [description, setDescription] = useState(role?.description ?? "")
  const [sort, setSort] = useState(role?.sort ?? 0)
  const [status, setStatus] = useState(role?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  function validate(): string | null {
    if (name.trim().length < 2) return t("roleNameMinLength")
    if (!code.trim()) return t("roleCodeRequired")
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
    if (isEdit && role) {
      const body: RoleUpdateInput = {
        name: name.trim(),
        code: code.trim(),
        // 留空显式传 null 清空（PATCH 语义，与用户表单 email/telephone 处理一致）
        description: description.trim() === "" ? null : description.trim(),
        sort,
        status,
      }
      updateMutation.mutate({ id: role.id, body }, { onSuccess: () => { onClose(); } })
    } else {
      const body: RoleCreateInput = { name: name.trim(), code: code.trim(), sort, status }
      if (description.trim()) body.description = description.trim()
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
          <DialogTitle>{isEdit ? t("editTitle") : t("addRole")}</DialogTitle>
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
              <FieldLabel htmlFor="role-form-name">{t("roleName")}</FieldLabel>
              <FieldContent>
                <Input
                  id="role-form-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                  }}
                  placeholder={t("roleNamePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="role-form-code">{t("roleCode")}</FieldLabel>
              <FieldContent>
                <Input
                  id="role-form-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value)
                  }}
                  placeholder={t("roleCodePlaceholder")}
                />
                <FieldDescription>{t("codeUppercase")}</FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="role-form-description">{t("description")}</FieldLabel>
              <FieldContent>
                <Input
                  id="role-form-description"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value)
                  }}
                  placeholder={t("descriptionPlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="role-form-sort">{t("sort")}</FieldLabel>
              <FieldContent>
                <Input
                  id="role-form-sort"
                  type="number"
                  value={sort}
                  onChange={(event) => {
                    // 清空输入视作 0（number input 空串无法直接作为 value）
                    setSort(event.target.value === "" ? 0 : Number(event.target.value))
                  }}
                />
              </FieldContent>
            </Field>
            <Field orientation="horizontal" className="gap-2">
              <Switch
                id="role-form-status"
                checked={status}
                onCheckedChange={setStatus}
              />
              <FieldLabel htmlFor="role-form-status">{t("enabled")}</FieldLabel>
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
