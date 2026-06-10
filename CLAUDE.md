# Projeto: Rentabilidade Cardápio — Sushi PN

## Visão Geral
App web de **gestão de rentabilidade e fichas técnicas** para o Sushi Ponta Negra.
Stack: HTML/CSS/JS puro + Supabase (sem framework, sem servidor).
Deploy: Vercel (automático via GitHub push).

---

## Configurações

| Item | Valor |
|------|-------|
| URL do app | https://rentabilidade-cardapio.vercel.app |
| Supabase URL | https://trczpnjidqfippbfxtpe.supabase.co |
| Supabase Key (publishable) | Fonte única em `utils.js` → `window.SUPA_KEY` (`sb_publishable_...`). ⚠️ Legacy anon/service_role foram REVOGADAS (não usar). A secret fica só no servidor (Edge Functions, env `APP_SERVICE_KEY`). |
| Tenant ID | 00000000-0000-0000-0000-000000000001 |
| GitHub | https://github.com/gilsonribeirosantos19-droid/Rentabilidade---Cardapio |

---

## Estrutura do Banco (Supabase)

### Tabela: `insumos`
- `id` uuid PK
- `tenant_id` uuid
- `nome` text
- `unidade_medida` text
- `unidade_compra` text
- `preco_compra` numeric — preço por kg/litro
- `rendimento_pct` numeric — % de aproveitamento (ex: 85)
- `ativo` boolean
- `created_at` timestamp

### Tabela: `fichas_tecnicas`
- `id` uuid PK
- `tenant_id` uuid
- `nome` text
- `categoria` text — temaki, sushi, hot, uramaki, sashimi, combo, prato, bebida, entrada, sobremesa, outros
- `rendimento_porcoes` integer
- `modo_preparo` text (nullable)
- `observacoes` text (nullable)
- `status` text — ativa, rascunho, arquivada
- `versao_atual` integer (default 1)
- `preco_venda` numeric(10,2) (nullable)
- `insumo_vinculado_id` uuid FK → insumos(id) (nullable) — para fichas de processados
- `rendimento_receita_g` numeric(10,3) (nullable) — rendimento em gramas da receita processada
- `created_at` timestamp
- `atualizado_em` timestamp

### Tabela: `itens_ficha`
- `id` uuid PK
- `ficha_id` uuid FK → fichas_tecnicas(id)
- `insumo_id` uuid FK → insumos(id)
- `quantidade_g` numeric — quantidade em gramas
- `ordem` integer

---

## Arquivos do Projeto

### `insumos.html`
- Cadastro de insumos (matéria-prima)
- CRUD completo com Supabase
- Campos: nome, unidade_medida, unidade_compra, preco_compra, rendimento_pct, ativo

### `fichas_tecnicas.html`
- Cadastro de fichas técnicas com ingredientes
- Calcula custo automaticamente pela fórmula:
  `custo = preco_compra / (rendimento_pct/100) / 1000 * quantidade_g`
- Indicadores no modal de visualização: Preço / CMV / Markup / Margem
- Semáforo CMV: verde ≤30%, amarelo ≤38%, vermelho >38%
- **Ficha de processado**: vincula a um insumo existente e atualiza o preço/kg automaticamente ao salvar
- Campo rendimento_receita_g para calcular custo real do processado

---

## Padrão de Código

### API, Config e Segurança (ATUALIZADO — refatoração 2026-06-10)
- **`api()` é CENTRALIZADA** no `utils.js` (`createApi`). **NÃO redefina `api()` dentro da tela** — use a compartilhada:
  ```javascript
  const SUPA_URL = window.SUPA_URL;   // fonte única (utils.js)
  const SUPA_KEY = window.SUPA_KEY;   // chave PUBLISHABLE (utils.js)
  const api = createApi(SUPA_URL, SUPA_KEY);
  ```
- **URL/chave = FONTE ÚNICA** no `utils.js` (`window.SUPA_URL`, `window.SUPA_KEY`). Pra trocar a chave, muda **só** lá.
- **Auth:** `createApi` autentica com o **token do login** (`localStorage.sb_token`) no `Authorization`; a `apikey` é a publishable. Isso faz o **RLS valer por tenant**.
- ⚠️ **NUNCA** usar a chave `service_role`/secret no frontend (ela ignora o RLS = falha grave de segurança). A chave do front é **sempre a `publishable`** (`sb_publishable_`). As legacy anon/service_role foram **revogadas** (2026-06-10).
- **Operações de admin** (criar/editar usuário) → via **Edge Function `admin-users`** (a chave admin fica no servidor, nunca no navegador).

### Regras importantes
- **DELETE nunca deve ter `Content-Type` ou `body`** — causa erro 400 no Supabase
- **PATCH de insumos não tem coluna `atualizado_em`** — não enviar esse campo
- Sempre usar `prefer: 'return=minimal'` no DELETE e PATCH sem necessidade de retorno
- Sempre filtrar por `tenant_id=eq.${TENANT_ID}` nas queries (o RLS reforça por tenant)

### Arquitetura — como EVITAR duplicação (OBRIGATÓRIO)
A maior dívida técnica do projeto veio de **copiar-colar** entre telas (chave, `api()`, funções `brl`/`esc`/`hoje`…) que depois **divergiram** (cada cópia virou uma versão diferente). Para NÃO repetir:

1. **Função reutilizável → vai no `utils.js`** (uma vez só). NÃO copiar a função pra dentro da tela.
2. **Já existe no `utils.js`? Usa a de lá** (`createApi`/`api`, `esc`, `brl`, `searchableSelect`, funções de custo, etc.) — não redefine.
3. **Config (URL/chave/tenant) só no `utils.js`** (`window.SUPA_*`). Nunca colar a chave numa tela.
4. **Estilo global → `design-system.css`** (cores, tabelas, sidebar, inputs). Ele usa `!important` e VENCE o CSS inline da página — então, se um estilo "não muda", edite o `design-system.css`, não a tela.
5. **Tela nova:** começar de um modelo enxuto que carrega o `utils.js` — NÃO copiar um arquivo gigante (ex: estoque.html).
6. **Mexeu numa tela?** Aproveite e **centralize as funções duplicadas dela** no `utils.js` (limpeza incremental, baixo risco — porque você já vai testar aquela tela).

### Design System
```css
--bg1:#0d0f14; --bg2:#161820; --bg3:#1e2030;
--border2:#252840;
--teal:#00d4aa; --teal2:#00b890; --teal-dim:rgba(0,212,170,.12);
--amber:#f59e0b; --red:#ef4444;
--text1:#f0f2ff; --text2:#94a3c4; --text3:#5a6080;
```
- Font: Inter + DM Mono (números/código)
- Sidebar escura com logo "Sushi PN / rentabilidade"

---

## Telas Planejadas (não construídas ainda)

- [ ] `dashboard.html` — visão geral métricas
- [ ] `precificacao.html` — simulador de preços antes de apontar na ficha
- [ ] `engenharia_cardapio.html` — matriz BCG (estrela/vaca/abacaxi/interrogação)
- [ ] `cmv.html` — CMV teórico x real
- [ ] `rendimento.html` — controle de rendimento
- [ ] `simulador.html` — simulador de cenários
- [ ] `fornecedores.html` — cadastro de fornecedores
- [ ] `alertas.html` — alertas de variação de custo
- [ ] `configuracoes.html` — configurações do tenant

---

## Fluxo de Deploy

1. Edita arquivos localmente
2. `git add .`
3. `git commit -m "descrição"`
4. `git push`
5. Vercel detecta e publica automaticamente em ~1-2 minutos

---

## Regras de Código (OBRIGATÓRIO)
- **SEMPRE** escrever código em inglês
- **NUNCA** traduzir palavras reservadas JavaScript: `function`, `const`, `let`, `var`, `async`, `await`, `return`, `if`, `else`, `for`, `while`, `class`, `new`, `this`, `true`, `false`, `null`, `undefined`, `try`, `catch`, `throw`, `import`, `export`, `default`
- Comentários e mensagens exibidas ao usuário podem ser em português
- Ao editar um arquivo existente, manter o estilo e padrão do código original
- Nunca reescrever o arquivo inteiro — apenas editar o trecho necessário

## Observações Importantes

- O projeto é **multi-tenant** mas por ora opera com um único tenant fixo
- Custo calculado sempre em **R$/kg** — quantidade dos ingredientes sempre em gramas
- Fichas de **processados** (Shari, molhos, etc.) vinculam a um insumo e atualizam o preço/kg automaticamente
- O campo `unidade_medida` dos insumos pode ser: kg, g, litro, ml, un
