import { type Page, expect } from '@playwright/test'

// Credenciais do usuário de teste (tenant 0001). Vêm do .env.local (local) ou de Secrets (CI).
export const E2E_EMAIL = process.env.E2E_EMAIL
export const E2E_SENHA = process.env.E2E_SENHA
export const temCredenciais = !!E2E_EMAIL && !!E2E_SENHA

// Faz login e espera cair no sistema (a barra de topo só existe logado).
export async function login(page: Page) {
  await page.goto('/')
  await page.locator('input[type="email"]').fill(E2E_EMAIL!)
  await page.locator('input[type="password"]').fill(E2E_SENHA!)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.locator('.topbar')).toBeVisible()
}

// Abre uma tela pela sidebar: clica no módulo (.modbar), expande o grupo se houver, clica na tela.
export async function abrirTela(page: Page, modulo: string, tela: string, grupo?: string) {
  await page.locator('.modbar .mod').filter({ hasText: modulo }).first().click()
  if (grupo) {
    const grp = page.locator('.secbar .sgrp').filter({ hasText: grupo })
    if (((await grp.getAttribute('class')) || '').includes('col')) {
      await grp.locator('.sgrp-h').click()   // grupo recolhido → expande
    }
  }
  await page.locator('.secbar').getByText(tela, { exact: true }).first().click()
}
