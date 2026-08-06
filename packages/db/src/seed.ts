// 种子数据（幂等可重跑）：菜单树 / 角色授权 / admin 账号（设计文档 §9）
// upsert 策略：有 permission 的按 permission findUnique；无 permission 的按 name+parentId findFirst；
// 存在则复用（不更新字段），不存在创建——重复运行不产生重复数据、不触发唯一约束冲突
import { prisma } from "./client.js"
import { hashPassword } from "./lib/password.js"

interface MenuSeedInput {
  name: string
  type: string
  path?: string
  component?: string
  permission?: string
  sort: number
  parentId?: string
}

async function upsertMenu(input: MenuSeedInput): Promise<string> {
  const existing = input.permission
    ? await prisma.menu.findUnique({ where: { permission: input.permission } })
    : await prisma.menu.findFirst({ where: { name: input.name, parentId: input.parentId ?? null } })
  if (existing) return existing.id
  const created = await prisma.menu.create({
    data: {
      name: input.name,
      type: input.type,
      // exactOptionalPropertyTypes：可选参数 undefined 不可显式赋值，统一转 null
      path: input.path ?? null,
      component: input.component ?? null,
      permission: input.permission ?? null,
      sort: input.sort,
      parentId: input.parentId ?? null,
    },
  })
  return created.id
}

async function main(): Promise<void> {
  try {
    // 1. 菜单树（与设计文档 §9 一致）
    const dashboardId = await upsertMenu({ name: "Dashboard", type: "MENU", path: "/", component: "dashboard", sort: 0 })
    const sysId = await upsertMenu({ name: "系统管理", type: "DIR", sort: 100 })
    const userMenuId = await upsertMenu({
      name: "用户管理", type: "MENU", path: "/system/user", component: "system/user",
      permission: "system:user:query", sort: 1, parentId: sysId,
    })
    await upsertMenu({ name: "用户新增", type: "BUTTON", permission: "system:user:create", sort: 1, parentId: userMenuId })
    await upsertMenu({ name: "用户编辑", type: "BUTTON", permission: "system:user:update", sort: 2, parentId: userMenuId })
    await upsertMenu({ name: "用户删除", type: "BUTTON", permission: "system:user:delete", sort: 3, parentId: userMenuId })
    await upsertMenu({ name: "分配角色", type: "BUTTON", permission: "system:user:assign-role", sort: 4, parentId: userMenuId })
    const roleMenuId = await upsertMenu({
      name: "角色管理", type: "MENU", path: "/system/role", component: "system/role",
      permission: "system:role:query", sort: 2, parentId: sysId,
    })
    await upsertMenu({ name: "角色新增", type: "BUTTON", permission: "system:role:create", sort: 1, parentId: roleMenuId })
    await upsertMenu({ name: "角色编辑", type: "BUTTON", permission: "system:role:update", sort: 2, parentId: roleMenuId })
    await upsertMenu({ name: "角色删除", type: "BUTTON", permission: "system:role:delete", sort: 3, parentId: roleMenuId })
    await upsertMenu({ name: "分配权限", type: "BUTTON", permission: "system:role:assign", sort: 4, parentId: roleMenuId })
    const menuMenuId = await upsertMenu({
      name: "菜单管理", type: "MENU", path: "/system/menu", component: "system/menu",
      permission: "system:menu:query", sort: 3, parentId: sysId,
    })
    await upsertMenu({ name: "菜单新增", type: "BUTTON", permission: "system:menu:create", sort: 1, parentId: menuMenuId })
    await upsertMenu({ name: "菜单编辑", type: "BUTTON", permission: "system:menu:update", sort: 2, parentId: menuMenuId })
    await upsertMenu({ name: "菜单删除", type: "BUTTON", permission: "system:menu:delete", sort: 3, parentId: menuMenuId })

    // 2. 角色：ADMIN 授权全量菜单+按钮；GUEST 仅 Dashboard（deleteMany + createMany 全量覆盖，幂等）
    const allMenuIds = (await prisma.menu.findMany({ select: { id: true } })).map((m) => m.id)
    const adminRole = await prisma.role.upsert({
      where: { code: "ADMIN" },
      update: { name: "管理员" },
      create: { name: "管理员", code: "ADMIN", sort: 0 },
    })
    await prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } })
    await prisma.roleMenu.createMany({ data: allMenuIds.map((menuId) => ({ roleId: adminRole.id, menuId })) })
    const guestRole = await prisma.role.upsert({
      where: { code: "GUEST" },
      update: { name: "访客" },
      create: { name: "访客", code: "GUEST", sort: 100 },
    })
    await prisma.roleMenu.deleteMany({ where: { roleId: guestRole.id } })
    await prisma.roleMenu.createMany({ data: [{ roleId: guestRole.id, menuId: dashboardId }] })

    // 3. 用户：admin / Admin@123（挂 ADMIN；update 也重置口令，保证 seed 后账号口令确定）
    const adminPasswordHash = await hashPassword("Admin@123")
    const adminUser = await prisma.user.upsert({
      where: { username: "admin" },
      update: {
        passwordHash: adminPasswordHash,
        nickname: "系统管理员",
        email: "admin@example.com",
        telephone: "13800138000",
      },
      create: {
        username: "admin",
        passwordHash: adminPasswordHash,
        nickname: "系统管理员",
        email: "admin@example.com",
        telephone: "13800138000",
      },
    })
    await prisma.userRole.deleteMany({ where: { userId: adminUser.id } })
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } })

    // 4. 摘要
    const menuCount = await prisma.menu.count()
    const roleCount = await prisma.role.count()
    const userCount = await prisma.user.count()
    console.log(`seed done: 菜单 ${String(menuCount)} 条 / 角色 ${String(roleCount)} 个 / 用户 ${String(userCount)} 个`)
    console.log("默认账号: admin / Admin@123（角色 ADMIN，已授权全部菜单）")
  } finally {
    await prisma.$disconnect()
  }
}

try {
  await main()
} catch (err) {
  const message = err instanceof Error ? err.stack ?? err.message : String(err)
  console.error("[seed] 失败:", message)
  process.exit(1)
}
