import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: {
    // host: true 监听全部地址（IPv4 + IPv6 + 局域网）。
    // 默认 localhost 在 Node/Windows 下只绑定 IPv6 ::1，浏览器走 IPv4(127.0.0.1) 时会连接失败——首页打不开的根因。
    host: true,
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
})
