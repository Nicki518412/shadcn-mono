import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"

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
    if (name.trim().length < 2) return "角色名称至少 2 个字符"
    if (!code.trim()) return "请输入角色编码"
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
          <DialogTitle>{isEdit ? "编辑角色" : "新增角色"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改角色信息" : "创建新的系统角色"}
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
              <FieldLabel htmlFor="role-form-name">角色名称</FieldLabel>
              <FieldContent>
                <Input
                  id="role-form-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                  }}
                  placeholder="角色显示名称"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="role-form-code">角色编码</FieldLabel>
              <FieldContent>
                <Input
                  id="role-form-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value)
                  }}
                  placeholder="大写编码，如 ADMIN"
                />
                <FieldDescription>编码保存时自动转为大写</FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="role-form-description">描述</FieldLabel>
              <FieldContent>
                <Input
                  id="role-form-description"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value)
                  }}
                  placeholder="角色说明（可选）"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="role-form-sort">排序</FieldLabel>
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
              <FieldLabel htmlFor="role-form-status">启用</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
