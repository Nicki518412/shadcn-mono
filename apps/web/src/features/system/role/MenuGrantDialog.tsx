import { useEffect, useState } from "react"
import type { JSX } from "react"

import {
  collectAncestorIds,
  collectOrphanAncestorIds,
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
import { useMenuTreeQuery } from "../menu/useMenus"
import { useAssignMenusMutation, useRoleMenusQuery } from "./useRoles"
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

  /**
   * 对称联动语义（对偶于取消）：勾选（含半选→全选点击）= 自身 + 祖先链 + 全部后代
   * （子树完整，点击父节点即带全子树）；取消 = 自身 + 全部后代 + 自下而上清理
   * 无剩余选中后代的孤儿祖先。不变式：任意勾选节点其祖先链与子树均完整；
   * 半选态仅在回显非闭包数据时可达。
   */
  function handleToggle(node: MenuNode, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(node.id)
        if (tree) {
          for (const id of [
            ...collectSelfAndDescendantIds(node),
            ...collectAncestorIds(node.id, tree),
          ]) {
            next.add(id)
          }
        }
      } else {
        for (const id of collectSelfAndDescendantIds(node)) next.delete(id)
        if (tree) {
          for (const id of collectOrphanAncestorIds(node.id, next, tree)) next.delete(id)
        }
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
      {/* p-6 加宽左右内边距（树形授权内容较宽）；滚动容器与 Footer 用 -mx-6 匹配 */}
      <DialogContent className="p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>分配权限</DialogTitle>
          <DialogDescription>
            为角色「{role.name}」配置菜单权限（勾选自动带上父目录与全部子项，取消自动
            级联取消并清理空授权目录），保存后将覆盖原有权限
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 max-h-[50vh] overflow-y-auto px-6 no-scrollbar">
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
              <div className="pr-1">
                <TreeCheckbox nodes={tree ?? []} selected={selected} onToggle={handleToggle} />
              </div>
            )}
          </FieldContent>
        </Field>
        </div>
        {/* -mx-6/-mb-6 覆盖默认 -mx-4/-mb-4，与 DialogContent 的 p-6 对齐（tailwind-merge） */}
        <DialogFooter className="-mx-6 -mb-6">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={assignMutation.isPending}
            className="h-9"
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            // 树/回显任一未就绪（pending 或 error，以 data 有无判定）即禁用保存——
            // 防止数据未到齐时误存空集、清空角色全部权限
            disabled={assignMutation.isPending || !menuTreeQuery.data || !roleMenusQuery.data}
            className="h-9"
          >
            {assignMutation.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
