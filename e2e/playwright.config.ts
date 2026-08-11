import { defineConfig } from "@playwright/test"

/** E2E 专用 SQLite 库（相对 packages/db/prisma 解析，与 dev.db 隔离；global-setup 重建+种子） */
export const E2E_DB_URL = "file:../../../e2e/e2e.db"

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // 本地/CI 均重试 1 次：Windows 长时运行 + vite dev 偶发慢加载（实测单文件连跑稳定、全量组合偶发超时）
  retries: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // 会话由 fixtures.ts 的 adminPage 逐用例独立登录（refresh token 单活轮换，不可跨用例复用）
  projects: [{ name: "chromium", testMatch: /\.spec\.ts/ }],
  // 两个服务：api（e2e 库）+ web（vite dev）；reuseExistingServer 允许复用本地已起的服务
  webServer: [
    {
      command: "pnpm exec tsx src/index.ts",
      cwd: "../apps/api",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DB_URL,
        JWT_SECRET: "e2e-test-secret-with-at-least-32-characters",
        PORT: "3001",
      },
    },
    {
      command: "pnpm exec vite --port 5173 --strictPort",
      cwd: "../apps/web",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
