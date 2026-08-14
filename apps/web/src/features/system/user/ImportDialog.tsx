import { useState } from "react"
import type { JSX } from "react"
import { useTranslation } from "react-i18next"

import { DownloadIcon, UploadIcon } from "lucide-react"

import type { components } from "@/api/schema"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { downloadBlob } from "@/lib/download"
import { useImportUsersMutation } from "./useUsers"

type ImportResult = components["schemas"]["ImportResult"]

/** 导入模板表头：必须保持中文且列序固定——后端按中文表头定位列解析（users.ts CSV_HEADERS），
 *  英文界面下载的模板同为中文表头（后端契约如此）；状态/角色列导入时忽略，导出文件可直接复用 */
const TEMPLATE_HEADER = "用户名,密码,昵称,邮箱,手机号,状态,角色"

/**
 * 导入用户 Dialog：选择 CSV 文件 → 上传导入 → 展示结果（成功条数 + 失败行明细）。
 * 模板下载为前端生成的表头 CSV（无数据）；导入完成后列表自动刷新（invalidate）。
 */
export function ImportDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation("users")
  const importMutation = useImportUsersMutation()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = importMutation.isPending

  function handleSubmit(): void {
    if (!file) {
      setError(t("importRequired"))
      return
    }
    setError(null)
    importMutation.mutate(file, {
      onSuccess: (data) => {
        setResult(data)
        setFile(null)
      },
    })
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
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {importMutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {importMutation.error.message}
            </p>
          )}
          {/* 模板下载：前端生成表头 CSV */}
          <Button
            type="button"
            variant="outline"
            className="h-9 justify-start gap-2"
            onClick={() => {
              downloadBlob(
                new Blob([`\uFEFF${TEMPLATE_HEADER}\r\n`], { type: "text/csv;charset=utf-8" }),
                "users-template.csv",
              )
            }}
          >
            <DownloadIcon />
            {t("downloadTemplate")}
          </Button>
          {result ? (
            /* 导入结果：成功/失败计数 + 失败行明细 */
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <p className="font-medium">{t("importResultTitle")}</p>
              <p>
                {t("importSuccessCount", { count: result.successCount })} ·{" "}
                {t("importFailedCount", { count: result.failedRows.length })}
              </p>
              {result.failedRows.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">{t("importFailedList")}</p>
                  <ul className="max-h-40 overflow-y-auto rounded border">
                    {result.failedRows.map((item) => (
                      <li
                        key={`${String(item.row)}-${item.message}`}
                        className="border-b px-2 py-1 text-xs last:border-b-0"
                      >
                        <span className="font-mono">{t("importFailedRow", { row: item.row })}</span>：{item.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            /* 文件选择 */
            <label className="flex h-9 cursor-pointer items-center justify-start gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground transition-colors hover:bg-accent">
              <UploadIcon className="size-4 shrink-0" />
              <span className="truncate">{file?.name ?? t("importFilePlaceholder")}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                }}
              />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending} className="h-9">
            {result ? t("close") : t("cancel")}
          </Button>
          {!result && (
            <Button type="button" onClick={handleSubmit} disabled={pending} className="h-9">
              {pending ? t("importing") : t("importStart")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
