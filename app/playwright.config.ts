import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Carrega app/.env.local no process.env (o Playwright, diferente do Vite, não lê .env sozinho).
// Precisa p/ E2E_EMAIL / E2E_SENHA chegarem aos testes. Não sobrescreve o que já veio do ambiente
// (ex.: GitHub Secrets no CI). Sem o arquivo, segue em frente (testes com login se pulam).
try {
  for (const line of readFileSync(new URL('.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (m && !line.trimStart().startsWith('#') && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/\s+$/, '').replace(/^["']|["']$/g, '')
    }
  }
} catch { /* sem .env.local → ok */ }

// E2E do Aiko. Roda contra a versão de PRODUÇÃO servida localmente (vite build + preview),
// pra pegar o pesadelo "build passa mas o site abre em branco" — que o unitário e o tsc não pegam.
// FICA FORA do build do Vercel: roda só via `npm run e2e` (local e/ou GitHub Actions).
const PORT = 4173
const BASE = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,              // folga p/ o CI (mais lento): login espera até 30s + navegação abre 10 telas
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
  // Sobe a build de produção localmente antes dos testes. reuseExistingServer deixa reaproveitar
  // um preview já aberto no dev (não rebuilda à toa); no CI sempre sobe do zero.
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
