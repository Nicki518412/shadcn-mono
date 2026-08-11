import { execSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { E2E_DB_URL } from "./playwright.config.js"

/**
 * E2E 全局前置：重建独立测试库（e2e/e2e.db，与 dev.db 隔离）+ 幂等种子。
 * 每次运行都重建，保证断言基准确定（admin/Admin@123 + 演示数据）。
 */
export default function globalSetup(): void {
  const repoRoot = path.resolve(import.meta.dirname, "..")
  const dbDir = path.join(repoRoot, "packages/db")
  mkdirSync(path.join(repoRoot, "e2e/.auth"), { recursive: true })

  const env = { ...process.env, DATABASE_URL: E2E_DB_URL }
  execSync("npx prisma db push --force-reset --skip-generate", { cwd: dbDir, env, stdio: "inherit" })
  execSync("pnpm exec tsx src/seed.ts", { cwd: dbDir, env, stdio: "inherit" })
  console.log("[e2e] 测试库就绪:", E2E_DB_URL)
}
