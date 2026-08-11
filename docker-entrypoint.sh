#!/bin/sh
# api 容器入口：同步数据库结构（db push 幂等）→ 空库时初始化种子 → 启动服务
set -e

echo "[entrypoint] 同步数据库结构..."
cd /app/packages/db
pnpm exec prisma db push --skip-generate

echo "[entrypoint] 检查并初始化种子数据..."
pnpm exec tsx src/init.ts

echo "[entrypoint] 启动 api 服务..."
cd /app/apps/api
exec pnpm exec tsx dist/index.js
