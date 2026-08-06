import { useEffect, useState } from "react"
import type { JSX } from "react"

import {
  collectAncestorIds,
  collectSelfAndDescendantIds,
  TreeCheckbox,
} from "@/components/business/TreeCheckbox"
import type { MenuNode } from "@/components/business/TreeCheckbox"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { useAssignMenusMutation, useMenuTreeQuery, useRoleMenusQuery } from "./useRoles"
import type { RoleListItem } from "./useRoles"

/**
 * 分配权限 Dialog：拉全量菜单树（含按钮）+ 角色已授权 menuIds 回显，
 * TreeCheckbox 树形勾选（父子联动：勾选自动带祖先、取消级联后代），
 * 保存 PUT /api/roles/{id}/menus 全量替换（含按钮节点）。
 * 页面按条件挂载，关闭即卸载——取消/关闭天然重置，无需手动清理。
 */
export function MenuGrantDialog({
  role,
  onClose,
}: {
  role: RoleListItem
  onClose: () => void
}): JSX.Element {
  const menuTreeQuery = useMenuTreeQuery()
  const roleMenusQuery = useRoleMenusQuery(role.id)
  const assignMutation = useAssignMenusMutation()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [initialized, setInitialized] = useState(false)

  // 回显写入 selected；仅同步一次——query 因 stale 在窗口聚焦等场景 refetch 时
  // 不得覆盖用户进行中的勾选（默认 staleTime 0，此为真实可达状态）
  useEffect(() => {
    if (roleMenusQuery.data && !initialized) {
      setSelected(new Set(roleMenusQuery.data.menuIds))
      setInitialized(true)
    }
  }, [roleMenusQuery.data, initialized])

  const tree = menuTreeQuery.data

  /** 父子联动：勾选 → 自身 + 自动带上全部祖先；取消 → 自身 + 全部后代级联取消 */
  function handleToggle(node: MenuNode, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(node.id)
        if (tree) {
          for (const ancestorId of collectAncestorIds(node.id, tree)) next.add(ancestorId)
        }
      } else {
        for (const descendantId of collectSelfAndDescendantIds(node)) next.delete(descendantId)
      }
      return next
    })
  }

  function handleSave(): void {
    assignMutation.mutate({ id: role.id, menuIds: [...selected] }, { onSuccess: () => { onClose(); } })
  }

  return (
    <Dialog
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>分配权限</DialogTitle>
          <DialogDescription>
            为角色「{role.name}」配置菜单权限（勾选自动带上父目录，取消自动取消子项），
            保存后将覆盖原有权限
          </DialogDescription>
        </DialogHeader>
        {assignMutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {assignMutation.error.message}
          </p>
        )}
        <Field>
          <FieldLabel>菜单权限</FieldLabel>
          <FieldContent>
            {menuTreeQuery.isPending || roleMenusQuery.isPending ? (
              <span className="text-sm text-muted-foreground">菜单加载中…</span>
            ) : menuTreeQuery.isError || roleMenusQuery.isError ? (
              <span className="text-sm text-destructive">
                {(menuTreeQuery.error ?? roleMenusQuery.error)?.message ?? "菜单加载失败"}
              </span>
            ) : (
              <div className="max-h-80 overflow-y-auto pr-1">
                <TreeCheckbox nodes={tree ?? []} selected={selected} onToggle={handleToggle} />
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
