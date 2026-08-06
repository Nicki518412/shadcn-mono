import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "@/components/ui/button"

describe("smoke", () => {
  it("runs in jsdom with testing-library", () => {
    render(<div>App 骨架</div>)
    expect(screen.getByText("App 骨架")).toBeTruthy()
  })

  it("renders a shadcn component", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole("button", { name: "Click me" })).toBeTruthy()
  })
})
