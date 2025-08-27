import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from "vite-plugin-dts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true, // 插入 types entry
      tsconfigPath: "./tsconfig.app.json",
      outDir: "./dist/types",
      entryRoot: "./src",
      copyDtsFiles: true,
    })
  ],
  build: {
    lib: {
      formats: ["es","cjs","umd"],
      entry: "src/main.ts",
      fileName: (format, name) => {
        if(format === "cjs"){
          return `${name}.${format}.cjs`
          }
          return `${name}.${format}.js`
      },
      name:"TestCore",
    },
    sourcemap: true,
  }
})
