# Legado — sistema HTML puro (pré-React)

Estes arquivos são o **sistema antigo** (HTML/CSS/JS puro + Supabase), que rodou em produção
até a migração para React (branch `feat/react-migration`, app em `app/`).

**Não estão mais em produção.** Os dois projetos Vercel (`rentabilidade-cardapio` e
`rentabilidade-cardapio-vryh`) usam **Root Directory = `app`** e servem o app React. Nenhum
deploy depende destes arquivos. Foram mantidos só como referência histórica.

- Telas antigas: `estoque.html`, `insumos.html`, `fichas_tecnicas.html`, `cmv.html`, etc.
- Portas de entrada antigas: `index.html` → `login.html` → `dashboard.html`.
- Portal antigo do gerente: `loja.html`, `portal_gerente.html`.
- Libs compartilhadas antigas: `utils.js` (config/api/helpers), `sidebar.js` (menu),
  `params.js`, `perms.js`, `fix.js`, `fix_estoque2.js`.

O `painel.html` (painel de TV) **não** está aqui — a versão viva é `app/public/painel.html`,
servida pelo deploy React. A cópia da raiz foi mantida por segurança.

Arquivado em 2026-08-19.
