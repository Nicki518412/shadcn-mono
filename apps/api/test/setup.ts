import { execSync } from "node:child_process"
import path from "node:path"
import { beforeAll } from "vitest"

beforeAll(() => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? "file:./test.db"
  process.env.DATABASE_URL ??= testDbUrl
  // 每次测试运行前重建测试库（--force-reset 保证干净；--skip-generate 避免重复生成 client）
  // cwd 必须指向 packages/db（Prisma 找 schema.prisma 与 .env 的基准目录）
  execSync("npx prisma db push --force-reset --skip-generate", {
    cwd: path.join(import.meta.dirname, "../../../packages/db"),
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "ignore",
  })
})
