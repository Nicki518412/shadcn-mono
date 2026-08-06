import { useState } from "react"
import type { JSX } from "react"

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
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { useRolesListQuery } from "../role/useRoles"
import { useAssignRolesMutation } from "./useUsers"
import type { UserListItem } from "./useUsers"

/**
 * 分配角色 Dialog（独立于用户表单）：拉全量角色 + 用户已挂角色回显，
 * Checkbox 多选，保存 PUT /api/users/{id}/roles 全量替换。
 */
export function RoleAssignDialog({
  user,
  onClose,
}: {
  user: UserListItem
  onClose: () => void
}): JSX.Element {
  const rolesQuery = useRolesListQuery()
  const assignMutation = useAssignRolesMutation()
  const [roleIds, setRoleIds] = useState<Set<string>>(
    () => new Set(user.roles.map((role) => role.id)),
  )

  function toggleRole(roleId: string, checked: boolean): void {
    setRoleIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(roleId)
      else next.delete(roleId)
      return next
    })
  }

  function handleSave(): void {
    assignMutation.mutate({ id: user.id, roleIds: [...roleIds] }, { onSuccess: () => { onClose(); } })
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
          <DialogTitle>分配角色</DialogTitle>
          <DialogDescription>
            为用户「{user.nickname}」配置角色（可多选），保存后将覆盖原有角色
          </DialogDescription>
        </DialogHeader>
        {assignMutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {assignMutation.error.message}
          </p>
        )}
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
                      id={`role-assign-${role.id}`}
                      checked={roleIds.has(role.id)}
                      onCheckedChange={(checked) => { toggleRole(role.id, checked); }}
                    />
                    <Label
                      htmlFor={`role-assign-${role.id}`}
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
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={assignMutation.isPending}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={assignMutation.isPending}>
            {assignMutation.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
