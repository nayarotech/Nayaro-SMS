import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The website renderer lives in the backend and is shared with the page editor,
      // so the editor shows exactly what visitors will see.
      "@site-renderer": path.resolve(__dirname, "../backend/src/modules/website/renderer/index.ts"),
      // Same grading rules as the server, so the marks grid shows the grade the report card will
      "@grading": path.resolve(__dirname, "../backend/src/modules/exams/grading.ts"),
    },
  },
  server: {
    port: 5173,
    // The API runs on :4000; proxying keeps the web app and API on one origin in development.
    proxy: { "/api": "http://localhost:4000", "/sites": "http://localhost:4000" },
    fs: { allow: [".", "../backend/src/modules/website/renderer", "../backend/src/modules/exams/grading.ts"] },
  },
});
