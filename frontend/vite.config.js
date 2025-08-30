import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // eslint-disable-next-line no-undef
  resolve: { alias: { "@": path.resolve(__dirname, "src") } }
});
