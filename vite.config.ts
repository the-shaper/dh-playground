import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/ascii-sound-drawer/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
