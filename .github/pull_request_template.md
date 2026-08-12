## 变更说明

<!-- 说明业务目标、主要改动和不做什么。 -->

## Review 清单

- [ ] 已确认业务规则和异常流程是否变化
- [ ] 权限码已同步种子菜单、后端 `requirePermission` 与前端 `Permission`
- [ ] API schema、OpenAPI 与前端生成类型保持一致
- [ ] 已检查 400 / 401 / 403 / 404 / 409 等错误语义
- [ ] 已检查 TanStack Query 缓存失效和登录态变化
- [ ] 多表写入、全量替换及“先查后写”已评估事务/并发风险
- [ ] 删除、禁用、改密和角色变更的关联副作用已验证
- [ ] 测试放在合适层级，关键用户旅程已有 E2E
- [ ] `pnpm lint && pnpm lint:e2e && pnpm test && pnpm build && pnpm typecheck:e2e` 通过

## 验证记录

<!-- 列出实际运行的命令；未运行项说明原因。 -->
