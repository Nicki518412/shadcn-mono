import { writeFileSync } from "node:fs"
import { createApp } from "../src/index.js"
import { API_INFO } from "../src/lib/schemas.js"

const app = createApp()
const doc = app.getOpenAPIDocument({
  openapi: "3.0.0",
  info: API_INFO,
})
writeFileSync(new URL("../openapi.json", import.meta.url), `${JSON.stringify(doc, null, 2)}\n`)
console.log("openapi.json written")
