# 数据库结构文档

- `schema.sql`：MySQL 方言 DDL，全字段中文注释，开发者速查用
- **运行时权威**是 `packages/db/prisma/schema.prisma`，本 SQL 文件仅作文档
- **同步约定**：任何 schema.prisma 变更（增删字段、改约束/索引/注释），必须同步更新本文件；CI 阶段人工核对双源一致性

## 三方言差异说明

| 项目 | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| 字段注释 | 不支持 COMMENT，用 `--` 行注释 | `COMMENT '...'` 内联 | `COMMENT ON COLUMN t.c IS '...'` |
| 布尔 | INTEGER 0/1 | BOOLEAN/TINYINT(1) | BOOLEAN |
| 外键级联 | 需 PRAGMA foreign_keys=ON（Prisma 自动处理） | 内联约束 | ALTER TABLE 追加 |
| 时间 | TEXT/DATETIME | DATETIME | TIMESTAMPTZ |

本文件为 MySQL 权威版；SQLite 与 PostgreSQL 的 DDL 由 Prisma migrate 生成（migrate 产物以各 provider 为准）。

## 切换数据库

```bash
# packages/db 下
# 1. 改 .env 的 DATABASE_URL
# 2. 改 prisma/schema.prisma 的 provider（sqlite/mysql/postgresql）
# 3. 重新生成并迁移
pnpm --filter @repo/db exec prisma migrate dev --name switch
pnpm --filter @repo/db seed
```
