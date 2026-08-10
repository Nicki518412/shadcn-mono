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
import { useCreateConfigMutation, useUpdateConfigMutation } from "./useConfigs"
import type { ConfigCreateInput, ConfigListItem, ConfigUpdateInput } from "./useConfigs"

/**
 * 新增/编辑系统参数 Dialog（页面按条件挂载，每次打开全新初始化，无需重置逻辑）：
 * - 新增：POST /api/configs（configKey/configValue/nameZh 必填）
 * - 编辑：PATCH /api/configs/{id}（configKey 禁用不可改；description 留空显式传 null 清空）
 */
export function ConfigFormDialog({
  config,
  onClose,
}: {
  config?: ConfigListItem | null
  onClose: () => void
}): JSX.Element {
  const { t } = useTranslation("config")
  const isEdit = Boolean(config)
  const createMutation = useCreateConfigMutation()
  const updateMutation = useUpdateConfigMutation()

  const [configKey, setConfigKey] = useState(config?.configKey ?? "")
  const [configValue, setConfigValue] = useState(config?.configValue ?? "")
  const [nameZh, setNameZh] = useState(config?.nameZh ?? "")
  const [nameEn, setNameEn] = useState(config?.nameEn ?? "")
  const [description, setDescription] = useState(config?.description ?? "")
  const [status, setStatus] = useState(config?.status ?? true)
  const [error, setError] = useState<string | null>(null)
  const pending = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error ?? updateMutation.error

  function validate(): string | null {
    if (!configKey.trim()) return t("configKeyRequired")
    if (!configValue.trim()) return t("configValueRequired")
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
    if (isEdit && config) {
      const body: ConfigUpdateInput = {
        configValue: configValue.trim(),
        nameZh: nameZh.trim(),
        // 留空显式传 null（en 语言回落中文名）
        nameEn: nameEn.trim() === "" ? null : nameEn.trim(),
        // 留空显式传 null 清空（PATCH 语义，与角色/字典表单处理一致）
        description: description.trim() === "" ? null : description.trim(),
        status,
      }
      updateMutation.mutate({ id: config.id, body }, { onSuccess: () => { onClose(); } })
    } else {
      const body: ConfigCreateInput = {
        configKey: configKey.trim(),
        configValue: configValue.trim(),
        nameZh: nameZh.trim(),
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
                <FieldLabel htmlFor="config-form-key">{t("configKeyLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="config-form-key"
                    value={configKey}
                    disabled={isEdit}
                    onChange={(event) => {
                      setConfigKey(event.target.value)
                    }}
                    placeholder={t("configKeyPlaceholder")}
                  />
                  {isEdit && <FieldDescription>{t("configKeyDisabled")}</FieldDescription>}
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="config-form-value">{t("configValueLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="config-form-value"
                    value={configValue}
                    onChange={(event) => {
                      setConfigValue(event.target.value)
                    }}
                    placeholder={t("configValuePlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="config-form-name-zh">{t("nameZhLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="config-form-name-zh"
                    value={nameZh}
                    onChange={(event) => {
                      setNameZh(event.target.value)
                    }}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="config-form-name-en">{t("nameEnLabel")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="config-form-name-en"
                    value={nameEn}
                    onChange={(event) => {
                      setNameEn(event.target.value)
                    }}
                    placeholder={t("nameEnPlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="config-form-description">{t("description")}</FieldLabel>
                <FieldContent>
                  <Input
                    id="config-form-description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value)
                    }}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field orientation="horizontal" className="gap-2">
                <Switch
                  id="config-form-status"
                  checked={status}
                  onCheckedChange={setStatus}
                />
                <FieldLabel htmlFor="config-form-status">{t("enabled")}</FieldLabel>
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
