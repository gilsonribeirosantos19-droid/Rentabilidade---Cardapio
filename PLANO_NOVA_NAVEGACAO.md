# Plano — Nova Navegação (sidebar 2 níveis, estilo Conta Azul)

> Modelo aprovado no protótipo `_exemplo_sidebar_contaazul.html`.
> Tudo no branch **preview-erp**, **fase por fase**. `main` só com o "sobe".

---

## 1. Objetivo
Trocar o `sidebar.js` atual (grupos que expandem pra baixo) pelo modelo **2 níveis**:
- Barra de **módulos** (220px) → clica num módulo → encolhe pra **rail de ícones (52px)** + abre **painel de seções (168px)** → total **220px** (mesma largura de hoje).
- Seta **"‹ Módulo"** volta/expande o principal.
- Workspace à direita com **abas** (já existe no `estoque.html` e no PDV).

## 2. Princípio de segurança (por que é de baixo risco)
1. **Largura total continua 220px** nos dois estados → **nenhum layout de página quebra** (o resto do app não sabe que o miolo da sidebar mudou).
2. **Nenhuma tela é movida, nenhum dado/SQL muda.** Só muda o **menu** (como se chega nas telas). As telas seguem nos mesmos arquivos.
3. Tudo concentrado em **1 arquivo**: `sidebar.js`. **Rollback = reverter 1 arquivo.**
4. **Preview primeiro**, testar, só então `main`.

## 3. O que NÃO muda nesta fase
- As telas (estoque.html, relatorios.html, ajustes.html, insumos.html...) — **intactas**.
- Banco, RLS, Edge Functions — **nada**.
- A largura da sidebar (220px) e os layouts das páginas.
- O hub de cards do `estoque.html` continua existindo (vira dashboard só na Fase 3).

---

## 4. Mapa Módulo → Seção → Tela real (verificado no código)

### Estoque (módulo PILOTO da Fase 1)
| Seção (submenu) | Item | Abre |
|---|---|---|
| _(direto)_ | Visão Geral | `estoque.html` (hub) |
| **Lançamentos** | Entradas | `estoque.html?tab=entradas` |
| | Saídas | `estoque.html?tab=saidas` |
| | Inventário | `estoque.html?tab=inventario` |
| **Consultas** | Saldo de Estoque | `estoque.html?tab=saldo-est` |
| | Movimentação | `estoque.html?tab=movimentacao` |
| | Kardex | `estoque.html?tab=kardex` |
| **Relatórios** | Histórico de Entradas | `relatorios.html?nome=entradas` |
| | Consumo de Insumos | `relatorios.html?nome=evolucao` |
| | Histórico de Custos | `relatorios.html?nome=historico-custo` |
| **Análises** | Curva ABC | `relatorios.html?nome=abc` |
| | Inflação | `relatorios.html?nome=inflacao` |
| | Resumo | `relatorios.html?nome=resumo` |
| _(direto)_ | Fechamento | `estoque.html?tab=fechamento` |
| _(direto)_ | Ajustes | `ajustes.html` |

### Demais módulos (mesma fase, só dados de menu)
- **Compras:** Sugestão de Compras → `estoque.html?tab=compras` · Pedidos de Compra → `compras.html`
- **Fiscal:** Monitor NF-e → `fiscal.html` · Entradas Processadas → `entradas_processadas.html` · Auditoria de Conversão → `relatorios.html?nome=auditoria`
- **Cadastros:** Insumos → `insumos.html` · Produtos → `produtos.html` · Fichas Técnicas → `fichas_tecnicas.html` · Fornecedores → `fornecedores.html`
- **Gestão:** CMV Teórico×Real → `cmv.html` · Rendimentos → `rendimento.html` · Divergências → `divergencias.html` · Fechamento de Custo → `fechamento_custo.html`
- **PDV:** Dashboard/Relatórios/Importar → `pdv.html?tab=...`
- **Produção:** Produção → `pcp.html` · Porcionamento → `porcionamento.html`
- **Config:** Geral/Usuários/Permissões/Parâmetros → `configuracoes.html?tab=...`

---

## 5. Fase 1 — passo a passo técnico (só `sidebar.js`)
1. **Estrutura de dados** `MODULES` (igual ao protótipo): cada módulo com ícone + seções; cada seção é item direto (`href`) ou subgrupo (`children: [{label, href}]`). `href` = a coluna "Abre" da tabela acima.
2. **Render 2 níveis** dentro do `<nav class="sidebar">` (continua 220px):
   - `renderModbar()` (lista de módulos) + `renderSecbar(modulo)` (seções do módulo, subgrupos **fechados** por padrão).
   - `dive(modulo)` = some o body class `dived` (encolhe modbar p/ 52px + mostra secbar 168px). `back()` volta.
3. **Detecção de ativo na carga:** ler `page` + `?tab`/`?nome` da URL → descobrir **qual módulo/seção** está ativo → já abrir "mergulhado" naquele módulo com a seção destacada. (Reaproveita a lógica de `page`/`_urlTab` que já existe no `sidebar.js`.)
4. **Permissões:** manter o filtro `_canView` por módulo (cada `href` mapeia um módulo no `_MODULO_MAP`). Seção/módulo sem nenhuma tela visível não aparece.
5. **CSS** (injetado pelo `sidebar.js`, como já é hoje): portar as classes do protótipo (`.modbar/.secbar/.mod/.item/.grp`, cores `#1e293b`/`#0f1a2e`, laranja, espaçamentos, letra normal).
6. **"Sem recarregar" dentro do Estoque (bônus da Fase 1):** estender o handler que o **PDV já tem** (`sidebar.js:~410`) pro `estoque.html` — clicar numa seção do Estoque estando no Estoque **troca a aba sem recarregar**. Indo p/ outro arquivo (ex.: Relatórios) → navega normal (recarrega).

> ⚠️ **Honesto:** na Fase 1, trocar de **módulo/arquivo** ainda **recarrega a página** (é o comportamento de hoje, só com o visual novo). O "tudo instantâneo, abas de qualquer módulo" é a **Fase 2**.

## 6. Como testar a Fase 1 (no preview)
- [ ] Abre cada módulo na barra → encolhe + painel de seções correto.
- [ ] Cada item do Estoque abre a **tela certa** (conferir os `?tab=`).
- [ ] Estando no Estoque, trocar de seção do Estoque é **instantâneo** (sem reload).
- [ ] Recarregar numa tela (ex.: `estoque.html?tab=movimentacao`) → a sidebar já abre **no módulo Estoque com Movimentação destacada**.
- [ ] Seta **‹** volta pra lista de módulos.
- [ ] **Permissões:** logar como perfil restrito → módulos/telas sem permissão **não aparecem**.
- [ ] Conferir **todas as outras telas** (insumos, fiscal, pdv...) — a sidebar abre e navega normal (não quebrou nada).
- [ ] Testar em tela menor (responsivo) — se quebrar, ajuste fino.

## 7. Rollback
`git checkout main -- sidebar.js` (ou reverter o commit). Como é 1 arquivo e nada de dado mudou, **volta na hora**.

---

## 8. Fases seguintes (depois da 1 aprovada)
- **Fase 2 — Workspace de abas do app inteiro:** abrir qualquer tela como **aba sem recarregar**, inclusive entre módulos (a "casca única"). Maior esforço; é onde o app vira SPA-leve. Trazer os **relatórios** pro mesmo workspace.
- **Fase 3 — Hub vira Dashboard:** a "Visão Geral" do Estoque deixa de ser lista de cards e vira **KPIs + alertas + atalhos** (sem duplicar o menu).

## 9. Riscos e mitigação
| Risco | Mitigação |
|---|---|
| `sidebar.js` é usado em TODAS as telas | Largura fixa 220px (layouts não mudam) + testar página por página no preview |
| Nome de aba/arquivo errado num link | Tabela do item 4 já verificada no código; checklist de teste item a item |
| Permissões pararem de filtrar | Manter `_canView`/`_MODULO_MAP`; testar com perfil restrito |
| Responsivo (telas pequenas) | Validar; se preciso, a sidebar colapsa/oculta no mobile (ajuste fino) |

---

**Resumo:** Fase 1 = trocar só o `sidebar.js` pelo modelo 2 níveis, apontando pras telas que já existem, mantendo 220px e permissões. Baixo risco, rollback de 1 arquivo, testado no preview antes do `main`.
