import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Route, Routes } from "react-router"

import { AuthProviderView } from "./auth/AuthProvider"
import { JwtAuthProvider } from "./auth/JwtAuthProvider"
import type { AuthProvider } from "./auth/types"
import AppLayout from "./layout/AppLayout"
import LoginPage from "./pages/LoginPage"
import { RequireAuth } from "./router/guards"
import "./index.css"

const queryClient = new QueryClient()

/**
 * provider 按 VITE_AUTH_PROVIDER 选择：local → JwtAuthProvider；
 * clerk → Task 24 替换为 ClerkAuthProvider（其 getSession 走 Clerk 会话，守卫/布局代码不感知差异）
 */
function createAuthProvider(): AuthProvider {
  if (import.meta.env.VITE_AUTH_PROVIDER === "clerk") return new JwtAuthProvider()
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
