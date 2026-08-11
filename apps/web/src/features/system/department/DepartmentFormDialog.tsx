import { useState } from "react"
import type { JSX, SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"

import { menuDisplayName } from "@/localization/menuName"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useCreateDepartmentMutation, useDepartmentsQuery, useUpdateDepartmentMutation } from "./useDepartments"
import type { DepartmentCreateInput, DepartmentItem } from "./useDepartments"
import type { DepartmentNode } from "./DepartmentTreeTable"
import { buildDepartmentTree } from "./DepartmentTreeTable"

/** 按 id 在树中查节点（编辑时排除自身及后代子树用） */
function findNodeById(list: DepartmentNode[], id: string): DepartmentNode | null {
  for (const node of list) {
    if (node.id === id) return node
    const found = findNodeById(node.children, id)
    if (found !== null) return found
  }
  return null
}

/** 递归收集节点自身及全部后代 id */
function collectSelfAndDescendantIds(node: DepartmentNode, acc: Set<string>): void {
  acc.add(node.id)
  for (const child of node.children) collectSelfAndDescendantIds(child, acc)
}

/** 收集父节点候选（{ id, name, depth }，depth 用于选项缩进） */
function collectParentOptions(
  list: DepartmentNode[],
  excludedIds: Set<string>,
  depth: number,
  result: { id: string; name: string; depth: number }[],
): void {
  for (const node of list) {
    if (excludedIds.has(node.id)) continue
    result.push({ id: node.id, name: menuDisplayName(node), depth })
    collectParentOptions(node.children, excludedIds, depth + 1, result)
  }
}

/**
 * 新增/编辑部门 Dialog：
 * - 父节点选项排除自身及全部后代（防循环挂载，与后端 collectSubtreeIds 一致）
 * - 编辑时父级留空 = 移到根级（显式传 null）；新增时留空 = 根部门
 */
export function DepartmentFormDialog({
  department,
  onClose,
}: {
  department?: DepartmentItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("department")
  const isEdit = Boolean(department)
  const departmentsQuery = useDepartmentsQuery()
  const createMutation = useCreateDepartmentMutation()
  const updateMutation = useUpdateDepartmentMutation()

  const [nameZh, setNameZh] = useState(department?.nameZh ?? "")
  const [nameEn, setNameEn] = useState(department?.nameEn ?? "")
  const [parentId, setParentId] = useState(department?.parentId ?? "")
  const [sort, setSort] = useState(department?.sort ?? 0)
  const [status, setStatus] = useState(department?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  const nodes = buildDepartmentTree(departmentsQuery.data ?? [])
  // 编辑时排除自身 + 全部后代（防循环）；新增无需排除
  const excludedIds = new Set<string>()
  if (department) {
    const self = findNodeById(nodes, department.id)
    if (self) collectSelfAndDescendantIds(self, excludedIds)
  }
  const parentOptions: { id: string; name: string; depth: number }[] = []
  collectParentOptions(nodes, excludedIds, 0, parentOptions)

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!nameZh.trim()) {
      setError(t("nameZhRequired"))
      return
    }
    setError(null)
    const body: DepartmentCreateInput = {
      nameZh: nameZh.trim(),
      // 留空显式传 null（en 语言回落中文名）
      nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
      parentId: parentId === "" ? null : parentId,
      sort,
      status,
    }
    if (isEdit && department) {
      updateMutation.mutate({ id: department.id, body }, { onSuccess: () => { onClose(); } })
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
              <FieldLabel htmlFor="dept-form-name-zh">{t("nameZhLabel")}</FieldLabel>
              <FieldContent>
                <Input
                  id="dept-form-name-zh"
                  value={nameZh}
                  onChange={(event) => {
                    setNameZh(event.target.value)
                  }}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="dept-form-name-en">{t("nameEnLabel")}</FieldLabel>
              <FieldContent>
                <Input
                  id="dept-form-name-en"
                  value={nameEn}
                  onChange={(event) => {
                    setNameEn(event.target.value)
                  }}
                  placeholder={t("nameEnPlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="dept-form-parent">{t("parent")}</FieldLabel>
              <FieldContent>
                <Select
                  value={parentId}
                  onValueChange={(value) => {
                    if (value !== null) setParentId(value)
                  }}
                >
                  <SelectTrigger id="dept-form-parent" className="w-full">
                    <SelectValue>
                      {(value) =>
                        parentOptions.find((option) => option.id === value)?.name ?? t("noParent")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("noParent")}</SelectItem>
                    {parentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id} label={option.name}>
                        <span style={{ paddingLeft: `${String(option.depth * 12)}px` }}>
                          {option.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t("parentDesc")}</FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="dept-form-sort">{t("sort")}</FieldLabel>
              <FieldContent>
                <Input
                  id="dept-form-sort"
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
                id="dept-form-status"
                checked={status}
                onCheckedChange={setStatus}
              />
              <FieldLabel htmlFor="dept-form-status">{t("enabled")}</FieldLabel>
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
