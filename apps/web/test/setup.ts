// jest-dom matcher 注册（显式挂到本包 vitest 的 expect 上）：
// jest-dom/vitest 内部 `import { expect } from 'vitest'` 从其自身 store 路径解析，
// 命中 pnpm hoisted 的 vitest@2（@repo/api 的依赖）——注册落在 2.x 的 expect 上，
// 本包 vitest 4 的 expect 看不到 matcher（"Invalid Chai property"）。
// 与类型增强同源问题（见 test/jest-dom.d.ts），这里运行时侧同样显式注册。
import { expect } from "vitest"
import * as jestDomMatchers from "@testing-library/jest-dom/matchers"

expect.extend(jestDomMatchers)

// jsdom 未实现 ResizeObserver（input-otp 组件依赖），注入空实现
class ResizeObserverStub {
  observe: ResizeObserver["observe"] = () => undefined
  unobserve: ResizeObserver["unobserve"] = () => undefined
  disconnect: ResizeObserver["disconnect"] = () => undefined
}

globalThis.ResizeObserver = ResizeObserverStub

// jsdom 未实现 PointerEvent（Base UI checkbox 的 dispatchClickWithModifiers
// 内部构造 new PointerEvent("click") 分发到隐藏 input），注入 MouseEvent 子类兜底
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? "mouse"
      this.isPrimary = params.isPrimary ?? true
    }
  }
  window.PointerEvent = PointerEventStub as typeof PointerEvent
}
