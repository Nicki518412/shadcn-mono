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
import { useCreateDictTypeMutation, useUpdateDictTypeMutation } from "./useDictTypes"
import type { DictTypeCreateInput, DictTypeListItem, DictTypeUpdateInput } from "./useDictTypes"

/**
 * 新增/编辑字典类型 Dialog（页面按条件挂载，每次打开全新初始化，无需重置逻辑）：
 * - 新增：POST /api/dicts/types（typeCode/nameZh 必填）
 * - 编辑：PATCH /api/dicts/types/{id}（typeCode 禁用不可改；description 留空显式传 null 清空）
 */
export function TypeFormDialog({
  type,
  onClose,
}: {
  type?: DictTypeListItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("dict")
  const isEdit = Boolean(type)
  const createMutation = useCreateDictTypeMutation()
  const updateMutation = useUpdateDictTypeMutation()

  const [typeCode, setTypeCode] = useState(type?.typeCode ?? "")
  const [nameZh, setNameZh] = useState(type?.nameZh ?? "")
  const [nameEn, setNameEn] = useState(type?.nameEn ?? "")
  const [description, setDescription] = useState(type?.description ?? "")
  const [sort, setSort] = useState(type?.sort ?? 0)
  const [status, setStatus] = useState(type?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  function validate(): string | null {
    if (!typeCode.trim()) return t("typeCodeRequired")
    if (!nameZh.trim()) return t("nameZhRequired")
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
    if (isEdit && type) {
      const body: DictTypeUpdateInput = {
        nameZh: nameZh.trim(),
        // 留空显式传 null（en 语言回落中文名）
        nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
        // 留空显式传 null 清空（PATCH 语义，与角色/用户表单处理一致）
        description: description.trim() === "" ? null : description.trim(),
        sort,
        status,
      }
      updateMutation.mutate({ id: type.id, body }, { onSuccess: () => { onClose(); } })
    } else {
      const body: DictTypeCreateInput = {
        typeCode: typeCode.trim(),
        nameZh: nameZh.trim(),
        sort,
        status,
      }
      if (nameEn.trim()) body.nameEn = nameEn.trim()
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
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
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
                <FieldLabel htmlFor="dict-type-form-code">{t("typeCodeLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="dict-type-form-code"
                    value={typeCode}
                    disabled={isEdit}
                    onChange={(event) => {
                      setTypeCode(event.target.value)
                    }}
                    placeholder={t("typeCodePlaceholder")}
                  />
                  {isEdit && <FieldDescription>{t("typeCodeDisabled")}</FieldDescription>}
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="dict-type-form-name-zh">{t("nameZhLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="dict-type-form-name-zh"
                    value={nameZh}
                    onChange={(event) => {
                      setNameZh(event.target.value)
                    }}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="dict-type-form-name-en">{t("nameEnLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="dict-type-form-name-en"
                    value={nameEn}
                    onChange={(event) => {
                      setNameEn(event.target.value)
                    }}
                    placeholder={t("nameEnPlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="dict-type-form-description">{t("description")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="dict-type-form-description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value)
                    }}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="dict-type-form-sort">{t("sort")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="dict-type-form-sort"
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
                  id="dict-type-form-status"
                  checked={status}
                  onCheckedChange={setStatus}
                />
                <FieldLabel htmlFor="dict-type-form-status">{t("enabled")}</FieldLabel>
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
