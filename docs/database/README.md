# 数据库结构文档

- `schema.sql`：MySQL 方言 DDL，全字段中文注释，开发者速查用
- **运行时权威**是 `packages/db/prisma/schema.prisma`，本 SQL 文件仅作文档
- **同步约定**：任何 schema.prisma 变更（增删字段、改约束/索引/注释），必须同步更新本文件；提交前人工核对双源一致性，CI 可加自动化字段名比对脚本
- 字段宽度与索引名均为手写近似值，以 `prisma migrate dev` 产物为准

## 权限语义速查（重要）

可见权限 = **用户所有角色授权菜单集合的纯严格交集**（非并集）：
- 任一角色为空集合 ⇒ 用户无任何权限；无任何角色同理
- 按钮（BUTTON）同样参与交集，仅用于页面内按钮显隐
- 导航规则：祖先目录补全显示（保证可达性）；无可见子孙的目录自动折叠

详细定义见 docs/superpowers/specs/2026-08-06-rbac-admin-design.md §6

## 三方言差异说明

> 口径说明：下表为手写方言指南（非 Prisma migrate 产物），仅作人工对照参考。
> 字段注释（下表首行）：Prisma migrate 不输出字段注释（docstring 不进 SQL），SQL 注释仅为本文档速查所用。

| 项目 | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| 字段注释 | 不支持 COMMENT，用 `--` 行注释 | `COMMENT '...'` 内联 | `COMMENT ON COLUMN t.c IS '...'` |
| 布尔 | INTEGER 0/1 | BOOLEAN/TINYINT(1) | BOOLEAN |
| 外键级联 | 需 PRAGMA foreign_keys=ON（Prisma 自动处理） | 内联约束 | Prisma PG 产物为 CREATE TABLE 内联外键 |
| 时间 | TEXT/DATETIME | DATETIME | TIMESTAMP(3)（Prisma 默认，无时区；TIMESTAMPTZ 需显式 `@db.Timestamptz`） |

本文件为 MySQL 权威版；SQLite 与 PostgreSQL 的 DDL 由 Prisma migrate 生成（migrate 产物以各 provider 为准）。

## 切换数据库

```bash
# packages/db 下
# 1. 改 .env 的 DATABASE_URL
# 2. 改 prisma/schema.prisma 的 provider（sqlite/mysql/postgresql）
# 3. 重新生成并迁移
pnpm --filter @repo/db db:migrate -- --name switch
pnpm --filter @repo/db seed
```
