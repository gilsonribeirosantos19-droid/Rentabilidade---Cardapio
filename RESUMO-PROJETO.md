# Resumo do Projeto — Aiko Sistema (Sushi PN / Mori Izakaya)

> Documento-resumo de **tudo que já foi construído**. Atualizado em **10/06/2026**.
> Histórico: **759 commits**, de **05/05/2026** a **10/06/2026**.

---

## 🎯 O que é o sistema
ERP web de **gestão de rentabilidade, CMV, estoque e fichas técnicas** para restaurante (Sushi Ponta Negra / Mori Izakaya).
- **Stack:** HTML + CSS + JavaScript puro (sem framework) + **Supabase** (banco/auth/API).
- **Deploy:** Vercel (publica automático ao dar `git push`).
- **Multi-tenant** (vários restaurantes) e **multi-loja**, hoje operando com o tenant Mori.

---

## 🗓️ Linha do tempo (por fases)

| Período | Foco principal |
|---|---|
| **05–08/05** | Fundação: telas iniciais, insumos, conexão com Supabase |
| **13–20/05** | Fichas técnicas, custo, primeiras telas de estoque |
| **21–27/05** | Estoque/Kardex, compras, porcionamento, **permissões por perfil**, portal do gerente |
| **28–31/05** | PCP completo, porcionamento (4 modelos), custo por loja, **segurança inicial (anon key + RLS + refresh JWT)** |
| **01–05/06** | NF-e / Fiscal (monitor, vínculos, auto-conversão), Entradas Processadas, design system |
| **06–09/06** | Polimento geral: tabelas estilo planilha, fiscal robusto, multi-código, PDV, Produtos (Saipos) |
| **10/06** | **Revisão de arquitetura + Segurança (Fase 1) + Centralização (Fase 2)** |

---

## 🧩 Módulos e telas construídas

### Cadastros
- **`insumos.html`** — matéria-prima (preço/kg, rendimento %, classificação, tipo de baixa). Bloqueio de nome duplicado, busca sem acento, filtros fixos.
- **`fichas_tecnicas.html`** — fichas com ingredientes em planilha, custo automático, CMV/markup/margem, fichas de **processado** (vinculam a um insumo e atualizam o preço/kg). Vínculo com **produto** (PDV).
- **`produtos.html`** — itens de venda (PDV/Saipos): identificação, classificação, comercial/CMV, fiscal. Código PDV.
- **`fornecedores.html`** — fornecedores + aba **Item × Fornecedor** (estilo Everest): cada item interno pode ter vários códigos por fornecedor, embalagem padrão.

### Estoque
- **`estoque.html`** — Saldo de Estoque (com data base/visão histórica), Movimentação (Kardex), filtros (grupo, só CMV, só com saldo), seletor de colunas, hub de Ajustes.
- **`ajustes.html`** — Ajuste de Estoque, Ajuste de Custo Médio, **Recalcular** (reconstrói saldo = Kardex). Ajustes viram movimento (estilo Everest).
- **Custo médio** por loja, **custo por período** (Nível 2): valoriza movimentação/fechamento pelo custo da época.

### Fiscal / NF-e
- **`fiscal.html`** — **Monitor de NF-e** (lê `nfe_recebidas`/`nfe_itens`): DANFE, Itens (estilo planilha), Erros. Status (pendente SEFAZ / para processar / processada / erro). Vínculo item↔insumo com **auto-conversão** (lê embalagem: "CAIXA C/ 9 KG", "20x900ml", litros), cadastro de insumo inline, multi-código por fornecedor, re-reconhecimento de itens.
- **`entradas_processadas.html`** — notas já processadas, ver itens, **estornar** (recalcula saldo/custo).
- **`divergencias.html`** — painel "raio-x" de inconsistências (ex: NF-e presa em trânsito +6h).
- **Recebimento automático de NF-e** via Edge Function `nfe-webhook` (FocusNFe → Supabase).

### Compras
- **`compras.html`** — Solicitação de Compra (por grupo, bottom sheet de quantidades), Processar, Pedidos Gerados, Sugestão de Compras.

### PCP / Produção
- **`pcp.html`** — hub do PCP com submenus.
- **`producao.html`** — produção de semiacabados.
- **`porcionamento.html`** — 4 modelos dinâmicos (Simples / Degelo / Cocção / Lote), cada um com campos e cálculos próprios; relatório Saldo Operacional.

### PDV / Vendas
- **`pdv.html`** — Dashboard (Faturamento, Faturamento por Produto) e Relatórios (Curva ABC, Engenharia de Cardápio). Integração **Saipos** planejada (vendas → CMV, **sem baixar estoque**).

### Portal do gerente / Loja
- **`loja.html`** / **`portal_gerente.html`** — portal simplificado para o gerente: solicitação de compra, inventário, porcionamento, relatórios. Sidebar própria.

### Análises
- **`relatorios.html`** — CMV, **Inflação** (variação de custo, períodos 3/6/12 meses), Curva ABC, Auditoria.
- **`cmv.html`** — CMV Teórico × Real (usa custo do período).
- **`rendimento.html`** — controle de rendimento.
- **`dashboard.html`** — visão geral, pendências operacionais, alertas.

### Configurações
- **`configuracoes.html`** — Geral, **Usuários** (criar/editar via Edge Function `admin-users`), **Permissões** (grupos de acesso, matriz por módulo), **Parâmetros**.

### Compartilhados (a base que evita duplicação)
- **`utils.js`** — config central (`window.SUPA_URL`/`SUPA_KEY`), `createApi` (com refresh de token), funções de custo (`custoDoInsumo`, `custoFichaPorcao`), seletor com busca global, helpers.
- **`sidebar.js`** — menu lateral (grupos, ícones, permissões).
- **`params.js`** / **`perms.js`** — parâmetros do sistema e permissões por perfil (cache).
- **`design-system.css`** — visual unificado (tabelas, sidebar, inputs). Usa `!important` (vence o CSS das telas).

---

## 🧠 Decisões importantes (o "porquê")
- **Baixa de estoque é manual** (Estoque → Saídas). PDV/ficha NÃO baixam estoque automático (por ora).
- **Saipos → CMV, não baixa estoque.** Vendas viram CMV; o estoque é controlado à parte.
- **Fonte única de custo:** `custoDoInsumo()`/`custoFichaPorcao()` no utils.js — PDV e CMV usam o mesmo cálculo.
- **Custo por período (Nível 2):** relatórios valorizam pelo custo da época, não o atual.
- **`custo_unitario` padronizado por unidade** (Kardex parou de dividir pelo fator).
- **Fator de conversão = fonte única** no cadastro (`insumo_fornecedores`); a NF-e lê de lá.
- **Multi-código:** um item interno pode ter vários códigos do mesmo fornecedor.
- **Workflow de branches:** tudo vai pra `preview-erp`; só publica no `main` quando autorizado.

---

## 🔐 Grande melhoria de 10/06/2026 — Segurança + Arquitetura

### Fase 1 — Segurança (CONCLUÍDA)
- **1.1 RLS** ligado em todas as tabelas (política `tenant_policy` por tenant).
- **1.2a** chave **service_role → anon** no frontend (5 arquivos); `params.js`/`perms.js` passam a usar o token do login.
- **1.2b** cadastro de usuário via **Edge Function `admin-users`** (chave admin só no servidor).
- ✅ Resultado: **nenhum** arquivo do frontend expõe mais a chave de admin.

### Fase 2 — Centralização (CONCLUÍDA)
- **Chave e URL** num lugar só (`utils.js` → `window.SUPA_*`); 21 telas apontam pra lá (de ~24 lugares → 1).
- **`api()` unificado** no `createApi` (os 4 `api()` duplicados foram removidos).

### Convenções (no `CLAUDE.md`)
Regras pra **não recriar duplicação**: função reutilizável vai no utils.js; usar a que já existe; config só no utils.js; estilo no design-system.css; tela nova de um modelo enxuto; limpar a tela ao mexer nela.

---

## ⏳ Pendências / próximos passos
- **Saipos Fase 3** — puxar vendas pela API do Saipos (aguarda documentação).
- **Fase 3 (arquitetura)** — limpar CSS (`!important`) → **incremental**, ao mexer nas telas.
- **Fase 4 (arquitetura)** — componentes / quebrar arquivos grandes → **incremental**.
- **Baixa automática de estoque** (PDV/ficha) — hoje desligada de propósito.

---

## ⚙️ Infra rápida
- **Supabase:** `https://trczpnjidqfippbfxtpe.supabase.co` (chave **anon** no front; **service_role** só em Edge Functions).
- **Edge Functions:** `nfe-webhook` (recebe NF-e), `admin-users` (cadastro de usuário). Não ficam no Git.
- **Tenant Mori** + tenant de testes (IDs nas memórias do projeto).
- **Deploy:** `git push` → Vercel publica em ~1-2 min.
