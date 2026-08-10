import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"
import { TriangleAlertIcon } from "lucide-react"

import i18n from "@/localization/i18n"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * 错误边界：包住 AppLayout 内层 Routes——任一页面渲染/生命周期抛错时展示兜底，
 * 避免白屏或整棵应用卸载（挂在 AppLayout 内层而非 main.tsx 顶层：
 * 错误只会吞掉页面区域，侧边栏/顶栏与登录流程不受影响）。
 * 兜底只提供刷新（window.location.reload 重置内存态）；路由切换不重置错误态属预期
 * ——导航到其他菜单同样被边界兜住，需刷新恢复。
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 兜底 UI 已提示用户，错误细节仅进控制台（当前无独立日志通道）
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  override render(): ReactNode {
    // class 组件无法使用 useTranslation hook——直接调 i18n 实例（错误页为异常态，无需即时响应语言切换）
    const t = i18n.t.bind(i18n)
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <TriangleAlertIcon className="size-8" />
          <p className="text-lg font-medium text-foreground">{t("errorTitle")}</p>
          <p>{t("errorDesc")}</p>
          <Button variant="outline" size="sm" onClick={() => { window.location.reload() }}>
            {t("refresh")}
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
