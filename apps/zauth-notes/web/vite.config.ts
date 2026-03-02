import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "./web",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3002",
      "/login": "http://127.0.0.1:3002",
      "/callback": "http://127.0.0.1:3002",
      "/logout": "http://127.0.0.1:3002",
      "/health": "http://127.0.0.1:3002"
    }
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: false
  }
});
