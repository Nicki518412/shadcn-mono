import "@testing-library/jest-dom/vitest"

// jsdom 未实现 ResizeObserver（input-otp 组件依赖），注入空实现
class ResizeObserverStub {
  observe: ResizeObserver["observe"] = () => undefined
  unobserve: ResizeObserver["unobserve"] = () => undefined
  disconnect: ResizeObserver["disconnect"] = () => undefined
}

globalThis.ResizeObserver = ResizeObserverStub
