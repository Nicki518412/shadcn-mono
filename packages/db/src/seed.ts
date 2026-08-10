// 种子数据（幂等可重跑）：菜单树 / 角色授权 / admin 账号（设计文档 §9）
// upsert 策略：有 permission 的按 permission findUnique；无 permission 的按 nameZh+parentId+path findFirst；
// 存在则更新 nameEn（多语言展示字段，种子变更需同步存量行），其余字段不更新；不存在创建——重复运行不产生重复数据、不触发唯一约束冲突
import { prisma } from "./client.js"
import { hashPassword } from "./lib/password.js"

interface MenuSeedInput {
  nameZh: string
  nameEn?: string
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
    : await prisma.menu.findFirst({
        where: { nameZh: input.nameZh, parentId: input.parentId ?? null, path: input.path ?? null },
      })
  if (existing) {
    if (input.nameEn !== undefined && existing.nameEn !== input.nameEn) {
      await prisma.menu.update({ where: { id: existing.id }, data: { nameEn: input.nameEn } })
    }
    return existing.id
  }
  const created = await prisma.menu.create({
    data: {
      nameZh: input.nameZh,
      nameEn: input.nameEn ?? null,
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
    // 1. 菜单树（与设计文档 §9 一致；nameEn 为英文展示名，en 语言时优先展示，未填回落 nameZh）
    const dashboardId = await upsertMenu({ nameZh: "Dashboard", nameEn: "Dashboard", type: "MENU", path: "/", component: "dashboard", sort: 0 })
    // 系统管理无 permission/path 稳定键，按 nameZh+parentId 匹配：种子源码改名会静默新建（旧节点残留，需人工清理）；菜单管理页创建同名根节点会被误命中
    const sysId = await upsertMenu({ nameZh: "系统管理", nameEn: "System", type: "DIR", sort: 100 })
    const userMenuId = await upsertMenu({
      nameZh: "用户管理", nameEn: "Users", type: "MENU", path: "/system/user", component: "system/user",
      permission: "system:user:query", sort: 1, parentId: sysId,
    })
    await upsertMenu({ nameZh: "用户新增", nameEn: "Add User", type: "BUTTON", permission: "system:user:create", sort: 1, parentId: userMenuId })
    await upsertMenu({ nameZh: "用户编辑", nameEn: "Edit User", type: "BUTTON", permission: "system:user:update", sort: 2, parentId: userMenuId })
    await upsertMenu({ nameZh: "用户删除", nameEn: "Delete User", type: "BUTTON", permission: "system:user:delete", sort: 3, parentId: userMenuId })
    await upsertMenu({ nameZh: "分配角色", nameEn: "Assign Roles", type: "BUTTON", permission: "system:user:assign-role", sort: 4, parentId: userMenuId })
    const roleMenuId = await upsertMenu({
      nameZh: "角色管理", nameEn: "Roles", type: "MENU", path: "/system/role", component: "system/role",
      permission: "system:role:query", sort: 2, parentId: sysId,
    })
    await upsertMenu({ nameZh: "角色新增", nameEn: "Add Role", type: "BUTTON", permission: "system:role:create", sort: 1, parentId: roleMenuId })
    await upsertMenu({ nameZh: "角色编辑", nameEn: "Edit Role", type: "BUTTON", permission: "system:role:update", sort: 2, parentId: roleMenuId })
    await upsertMenu({ nameZh: "角色删除", nameEn: "Delete Role", type: "BUTTON", permission: "system:role:delete", sort: 3, parentId: roleMenuId })
    await upsertMenu({ nameZh: "分配权限", nameEn: "Grant Permissions", type: "BUTTON", permission: "system:role:assign", sort: 4, parentId: roleMenuId })
    const menuMenuId = await upsertMenu({
      nameZh: "菜单管理", nameEn: "Menus", type: "MENU", path: "/system/menu", component: "system/menu",
      permission: "system:menu:query", sort: 3, parentId: sysId,
    })
    await upsertMenu({ nameZh: "菜单新增", nameEn: "Add Menu", type: "BUTTON", permission: "system:menu:create", sort: 1, parentId: menuMenuId })
    await upsertMenu({ nameZh: "菜单编辑", nameEn: "Edit Menu", type: "BUTTON", permission: "system:menu:update", sort: 2, parentId: menuMenuId })
    await upsertMenu({ nameZh: "菜单删除", nameEn: "Delete Menu", type: "BUTTON", permission: "system:menu:delete", sort: 3, parentId: menuMenuId })
    await upsertMenu({
      nameZh: "日志管理", nameEn: "Logs", type: "MENU", path: "/system/log", component: "system/log",
      permission: "system:log:query", sort: 4, parentId: sysId,
    })
    const sessionMenuId = await upsertMenu({
      nameZh: "会话管理", nameEn: "Sessions", type: "MENU", path: "/system/session", component: "system/session",
      permission: "system:session:query", sort: 5, parentId: sysId,
    })
    await upsertMenu({ nameZh: "强制下线", nameEn: "Force Sign-out", type: "BUTTON", permission: "system:session:revoke", sort: 1, parentId: sessionMenuId })

    // 2. 角色：ADMIN 授权全量菜单+按钮；GUEST 仅 Dashboard（deleteMany + createMany 全量覆盖，幂等）
    const allMenuIds = (await prisma.menu.findMany({ select: { id: true } })).map((m) => m.id)
    const adminRole = await prisma.role.upsert({
      where: { code: "ADMIN" },
      update: { nameZh: "管理员", nameEn: "Administrator" },
      create: { nameZh: "管理员", nameEn: "Administrator", code: "ADMIN", sort: 0 },
    })
    await prisma.$transaction([
      prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } }),
      prisma.roleMenu.createMany({ data: allMenuIds.map((menuId) => ({ roleId: adminRole.id, menuId })) }),
    ])
    const guestRole = await prisma.role.upsert({
      where: { code: "GUEST" },
      update: { nameZh: "访客", nameEn: "Guest" },
      create: { nameZh: "访客", nameEn: "Guest", code: "GUEST", sort: 100 },
    })
    await prisma.$transaction([
      prisma.roleMenu.deleteMany({ where: { roleId: guestRole.id } }),
      prisma.roleMenu.createMany({ data: [{ roleId: guestRole.id, menuId: dashboardId }] }),
    ])

    // 3. 用户：admin / Admin@123（挂 ADMIN；update 分支同样重置口令与联系信息，保证 seed 后账号口令与演示联系方式确定）
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
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: adminUser.id } }),
      prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } }),
    ])

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
