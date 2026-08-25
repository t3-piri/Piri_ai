import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Gelistirme sunucusu (npm run dev), /api ve /avatars isteklerini FastAPI
// backend'ine yonlendirir - boylece backend tarafinda CORS acmaya gerek
// kalmaz. run_web.ps1 varsayilan olarak 8000 portunu dener (dolu ise
// artirir); baska bir port kullaniyorsan PIRI_DEV_PROXY_TARGET ile bu
// adresi gecebilirsin.
const backendTarget = process.env.PIRI_DEV_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": { target: backendTarget, changeOrigin: true },
      "/avatars": { target: backendTarget, changeOrigin: true },
    },
  },
});
