import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Route, Routes } from "react-router"

import { AuthProviderView } from "./auth/AuthProvider"
import { JwtAuthProvider } from "./auth/JwtAuthProvider"
import type { AuthProvider } from "./auth/types"
import { Toaster } from "./components/ui/sonner"
import AppLayout from "./layout/AppLayout"
import LoginPage from "./pages/LoginPage"
import { RequireAuth } from "./router/guards"
import "./index.css"

const queryClient = new QueryClient()

/**
 * provider 按 VITE_AUTH_PROVIDER 选择：local → JwtAuthProvider；
 * clerk → Task 24 实现 ClerkAuthProvider（其 getSession 走 Clerk 会话，守卫/布局代码不感知差异）。
 * 未实现前显式抛错，防止提前设置 env 时静默得到 JWT 行为
 */
function createAuthProvider(): AuthProvider {
  if (import.meta.env.VITE_AUTH_PROVIDER === "clerk") {
    throw new Error("ClerkAuthProvider 未实现（Task 24）")
  }
  return new JwtAuthProvider()
}

const authProvider = createAuthProvider()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProviderView provider={authProvider}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />} />
            </Route>
          </Routes>
        </BrowserRouter>
        {/* toast 全局出口（sonner）；next-themes 未挂 Provider 时 useTheme 回落 system，安全 */}
        <Toaster />
      </AuthProviderView>
    </QueryClientProvider>
  )
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element not found")

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
