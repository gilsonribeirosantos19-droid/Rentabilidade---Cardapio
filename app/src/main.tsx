import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { initSentry } from './lib/sentry'
import './index.css'

initSentry()   // liga o monitor de erros (só se houver VITE_SENTRY_DSN)

// Tela amigável se um componente quebrar (evita "tela branca"); o erro vai pro Sentry.
function ErroFatal() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#334155', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>😕</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Algo deu errado nesta tela</div>
      <div style={{ fontSize: 14, color: '#64748b', maxWidth: 420 }}>Nossa equipe já foi avisada automaticamente. Tente recarregar a página.</div>
      <button onClick={() => window.location.reload()} style={{ marginTop: 6, background: '#14315F', color: '#fff', border: 0, borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Recarregar</button>
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      gcTime: 60 * 60 * 1000,   // mantém o cache por 1h: ao voltar do ocioso a tela mostra na hora (não descarta em 5min)
      staleTime: 60 * 1000,     // dados "frescos" por 1min → menos recarga ao trocar de aba. Mutações invalidam mesmo assim.
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Sentry.ErrorBoundary fallback={<ErroFatal />}>
          <App />
        </Sentry.ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
