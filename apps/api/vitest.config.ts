import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    // 单 worker：避免多 worker 并发 db push --force-reset 互相踩（test.db-journal 残留根因）。
    // vitest 4 移除了 singleFork，等价配置为 fileParallelism: false（maxWorkers 强制为 1）
    fileParallelism: false,
    setupFiles: ["./test/setup.ts"],
  },
})
