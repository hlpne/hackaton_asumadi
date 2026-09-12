import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const env = loadEnv(mode, root, "");
  const target = process.env.BACKEND_PROXY_TARGET || env.BACKEND_PROXY_TARGET || "http://127.0.0.1:8000";
  const proxy = { "/api": { target, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, "") } };
  return { plugins: [react()], server: { proxy }, preview: { proxy } };
});
