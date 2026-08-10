import { StrictMode, useState } from "react"
import type { JSX } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { BrowserRouter, Route, Routes } from "react-router"

import { AuthProviderView } from "./auth/AuthProvider"
import { ClerkAuthProvider } from "./auth/ClerkAuthProvider"
import { ClerkAuthShell } from "./auth/clerk"
import { JwtAuthProvider } from "./auth/JwtAuthProvider"
import type { AuthProvider } from "./auth/types"
import { Toaster } from "./components/ui/sonner"
import "./localization/i18n"
import LoginPage from "./pages/LoginPage"
import { RequireAuth } from "./router/guards"
import "./index.css"

// QueryClient 在组件内创建（惰性）：生产入口只 render 一次 App，语义不变；
// 测试每次 render 获得干净实例，避免跨测试缓存/错误状态泄漏（曾导致已登录用例被旧 error 缓存误判未登录）

/**
 * provider 按 VITE_AUTH_PROVIDER 选择：local → JwtAuthProvider；clerk → ClerkAuthProvider
 * （会话由 <ClerkProvider> 托管，守卫/布局代码经 AuthProvider 抽象不感知差异）。
 * clerk 模式整棵树包在 ClerkAuthShell（ClerkProvider + ClerkSessionAdapter 桥接）内。
 */
const isClerk = import.meta.env.VITE_AUTH_PROVIDER === "clerk"
const authProvider: AuthProvider = isClerk ? new ClerkAuthProvider() : new JwtAuthProvider()

function AppShell(): JSX.Element {
  return (
    // 主题 Provider 挂最外层（QueryClientProvider 之内）：attribute="class" 与 index.css 的
    // @custom-variant dark 匹配；defaultTheme=system 跟随系统偏好，enableSystem 允许后续切换。
    // 不设 disableTransitionOnChange：允许主题切换过渡动画（ThemeToggle 切换时临时挂 theme-transition class）
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProviderView provider={authProvider}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* path="*" 必须：守卫分支要能匹配根路径 "/" 与全部业务路径（含动态菜单路由）。
                曾缺失导致 React Router 对 "/" 无匹配 → 白屏（真实浏览器才暴露，组件测试测不到）。
                守卫内部直接渲染 AppLayout（AppLayout 自带嵌套 Routes：动态菜单路由 + 404）。 */}
            <Route path="*" element={<RequireAuth />} />
          </Routes>
        </BrowserRouter>
        {/* toast 全局出口（sonner）：ThemeProvider 已挂载，useTheme 返回真实主题，随系统/手动切换 */}
        <Toaster />
      </AuthProviderView>
    </ThemeProvider>
  )
}

/** 根组件（导出供 app-routing 集成测试渲染；main.tsx 入口挂载） */
export function App(): JSX.Element {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      {isClerk ? (
        <ClerkAuthShell>
          <AppShell />
        </ClerkAuthShell>
      ) : (
        <AppShell />
      )}
    </QueryClientProvider>
  )
}

// 挂载只在浏览器入口执行：jsdom 测试 import App 时无 #root，跳过挂载（路由表测试依赖此行为）
const rootElement = document.getElementById("root")
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
