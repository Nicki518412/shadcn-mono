// jest-dom 类型增强（针对本包 vitest 3.x）
// 背景：@testing-library/jest-dom/vitest 的 declare module "vitest" 从其自身 store 路径解析
// 'vitest'，命中 pnpm hoisted 的 vitest@2（@repo/api 的依赖），增强合并进了 2.x 的
// Assertion 接口；而本包测试文件 import 的 expect 来自本地 vitest@3.2.7——类型增强落空，
// 表现为全部 jest-dom matcher 报 TS2339（运行时不受影响，setup.ts 的 side-effect import 已注册）。
// 此处针对本包解析到的 'vitest' 重新声明增强；两份增强各自合并到对应版本的接口，互不冲突。
// 此处与上游 jest-dom types/vitest.d.ts 的增强写法一致（type 参数与 any 为合并
// 原接口的泛型签名与 TestingLibraryMatchers 两个类型参数所必需，无法避免）
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type */
import "vitest"
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers"

declare module "vitest" {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
