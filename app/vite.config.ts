import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vitest (unitários) roda SÓ os src/**/*.test.ts. O e2e (Playwright) fica em e2e/ e roda
  // à parte (`npm run e2e`) — nunca entra no build do Vercel.
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
