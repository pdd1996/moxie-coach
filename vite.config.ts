import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dbApi, pyodideStatic } from './server/middleware.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pyodideStatic(), dbApi()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})