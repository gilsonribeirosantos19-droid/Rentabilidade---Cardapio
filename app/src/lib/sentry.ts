import * as Sentry from '@sentry/react'

// Monitor de erros (Sentry). A DSN é PÚBLICA por natureza (vai no bundle do site),
// então fica fixa aqui com fallback; dá pra sobrescrever por env (VITE_SENTRY_DSN).
// Liga SÓ no build publicado (produção/preview) — NUNCA em dev local (import.meta.env.PROD).
// Privacidade/LGPD: o Session Replay mascara TODO texto e bloqueia mídia —
// grava só o "esqueleto" da tela pra entender o que levou ao erro, sem expor dados.
const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)
  || 'https://682eb832b3473ec60c96865a07378dc7@o4512230236749824.ingest.us.sentry.io/4512230266044416'
const enabled = !!dsn && import.meta.env.PROD

export function initSentry() {
  if (!enabled) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,            // 'production' no build publicado
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,                         // 10% das navegações (performance) — econômico
    replaysSessionSampleRate: 0,                   // não grava sessões normais
    replaysOnErrorSampleRate: 1,                   // grava o replay QUANDO dá erro (útil + barato)
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed',
      'Non-Error promise rejection captured',
    ],
  })
}

// Identifica QUEM/qual loja teve o erro (aparece no painel do Sentry).
// Sem e-mail por padrão seria mais conservador, mas o e-mail agiliza o suporte;
// se precisar remover por LGPD, é só tirar o campo `email` abaixo.
export function setSentryUser(u: { id?: string; email?: string; nome?: string; tenant_id?: string | null } | null) {
  if (!enabled) return
  if (!u) { Sentry.setUser(null); return }
  Sentry.setUser({ id: u.id, email: u.email, username: u.nome })
  Sentry.setTag('tenant', u.tenant_id || 'sem-tenant')
}
