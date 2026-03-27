import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages: https://<username>.github.io/VishGuard/
  base: '/VishGuard/',
})
