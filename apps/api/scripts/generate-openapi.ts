import { writeFileSync } from "node:fs"
import { createApp } from "../src/index.js"

const app = createApp()
const doc = app.getOpenAPIDocument({
  openapi: "3.0.0",
  info: { title: "shadcn-mono API", version: "0.1.0" },
})
writeFileSync(new URL("../openapi.json", import.meta.url), JSON.stringify(doc, null, 2))
console.log("openapi.json written")
