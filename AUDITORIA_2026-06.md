# RELATÓRIO FINAL DE AUDITORIA — Sistema Aiko (Rentabilidade Cardápio / Sushi PN)
> Varredura completa pré-produção (PRD) — 2026-06-13. 10 domínios auditados, 64 achados consolidados.

## Resumo Executivo

O núcleo de custo do sistema está sólido: a fonte única (`custoDoInsumo`/`custoMedioNaData`/`custoFichaPorcao` em `utils.js`), o custo médio ponderado e o saldo de estoque (`Saldo = Inicial + Entradas − Saídas ± Ajustes`) são corretos e consistentes no caminho ao vivo (entrada manual, NF-e, ajuste, transferência, inventário atômico). **Em loja única — o caso atual da Mori — o sistema opera de forma confiável.** Porém **NÃO está pronto para produção sem correções**, por três classes de problema concretos: (1) bugs de cálculo ativos hoje (CMV com faturamento zerado, relatório de Inflação dividindo o preço pelo fator de novo, custo de fichas com insumo `un/cx/pct` ~1000x errado entre telas, portal gravando custo por embalagem); (2) provisionamento de banco frágil — a migração não cria nenhuma PK/FK/UNIQUE/INDEX e omite tabelas/colunas usadas pelo código, então **um tenant novo nasce quebrado**; (3) dívida técnica de copy-paste (NF-e, produção, custo de ficha, filtros) que já começou a divergir. A maioria dos domínios confirma que a *espinha dorsal* está correta — os problemas estão nas pontas (relatórios, multi-loja, produção→estoque) e no DDL versionado.

---

## 1. Inconsistências encontradas

| Descrição | Impacto | Prioridade |
|---|---|---|
| **Faturamento: campo gravado (`valor`) ≠ campo lido em `cmv.html` (`total/valor_total`)** — PDV grava em `valor` (pdv.html:1743/1399), estoque lê `valor` (estoque.html:3889), mas cmv.html soma `f.total\|\|f.valor_total` (cmv.html:501). Denominador do CMV zera → KPIs "CMV % faturamento", `k-teo-pct`, `k-real-pct`, `divPct` aparecem 0%/—. | Alto | P1 |
| **`on_conflict` do `saldo_estoque` divergente** — 5 telas usam `tenant_id,insumo_id,loja_id`; `ajustes.html:837` e `:879` usam `insumo_id,loja_id`. (3 domínios) | Alto | P1 |
| **Inventário: status `'encerrado'` gravado vs `'fechado'` consultado** (estoque.html:4058, 3851, 3857) → Movimentação/Fechamento ignoram a contagem real. | Alto | P1 |
| Painel "Custo real/kg" usa só `preco_compra` (insumos.html:662; fornecedores.html:971,993) | Baixo | P3 |
| `porcionamento.html:861` usa `preco_compra` como custo-padrão (data-custo) | Baixo | P3 |
| Histórico de Ajuste de Custo Médio lê `ajustes_custo_medio` (ninguém grava lá) → log vazio (ajustes.html:905) | Baixo | P3 |
| Sugestão de compras conta só `'consumo'`; portal grava saída `'manual'` (estoque.html:4417 vs loja.html:2748) | Médio | P2 |
| Custo do processado salvo em `preco_compra`, fonte oficial é `custo_medio` (fichas_tecnicas.html:1077 vs utils.js:183) | Médio | P2 |
| `modelo` vs `modelo_processo` duplicado em `porcao_lancamentos`; filtro usa só `modelo_processo` (porcionamento.html:717) | Médio | P2 |
| "Aproveitamento" com 2 significados sem rótulo; thresholds de cor diferentes | Baixo | P3 |
| `observacao` vs `observacoes` inconsistente nas telas de produção | Baixo | P3 |
| Semáforo CMV conta crítica tudo >30% (deveria >38%) (fichas_tecnicas.html:579) | Médio | P2 |

---

## 2. Divergências de cálculo

| Tela / Local | Regra atual | Regra correta |
|---|---|---|
| **`relatorios.html:1147`** (Inflação) | `custo_unitario/(fator\|\|1)` — divide de novo | não dividir (já é por-unidade); fix já em estoque.html:3313 |
| **`loja.html:2718-2727`** (entrada portal) | grava `custo_unitario: custo` (embalagem) | `custo_unitario: custoUnit` (= custo/fator) |
| **`utils.js:196` vs `fichas_tecnicas.html:860`** | fórmulas diferentes p/ un/pct/cx | mesma fórmula — hoje insumo unitário sai ~1000x diferente entre ficha e PDV/CMV |
| **`fichas_tecnicas.html:866`** (`custoFicha`) | custo TOTAL, sem dividir por `rendimento_porcoes` | dividir por porções (CMV/margem inflados em fichas >1 porção) |
| **`dashboard.html:519,543`** | "CMV" = compras ÷ valor_estoque | não é CMV — renomear/usar definição oficial |
| **`dashboard.html:569`** | CMV = consumo×custo ÷ valor_estoque | denominador = faturamento (ARQUITETURA §4.4) |
| **registrarEntrada (fiscal/estoque)** | custo médio incremental; entrada retroativa vira "última" | recalcular por data ou avisar fora de ordem |
| **`entradas_processadas.html:303`** (estorno) | média simples | reusar `custoMedioNaData` |
| **getSaldo/Kardex/relatorios.html:936** | sem loja: 1ª linha / média aritmética | somar qtd e ponderar custo por loja (latente — 1 loja) |
| **`pcp.html:947`** | `venda \|\| produzido-sobra` (esquece sobra_anterior) | `max(0, sobra_ant + produzido - sobra_final)` |
| **`estoque.html:3871`** (Fechamento) | CMV por inventário | conceito ≠ cmv.html — rotular distinto |
| **`cmv.html:386`** | qReal bruto vs qTeo líquido | aplicar rendimento no qTeo ou rotular |

---

## 3. Problemas de arquitetura

| Descrição | Impacto |
|---|---|
| **Dois sistemas de produção paralelos** — `producao.html`→`producao`; `pcp.html`→`pcp_producao`/`pcp_sobras`, não compartilham. (3 domínios) | **Alto** |
| **Produção/PCP/Porcionamento não movimentam estoque** — não baixam insumo nem geram semiacabado/custo. Quebra Cenário 2 do PRD. (3 domínios) | **Alto** |
| **`fichas_tecnicas.html` não usa a fonte única** — reimplementa custo, pula fallback nível 2 (vínculo). (2 domínios) | Alto |
| **Importação NF-e duplicada em `estoque.html` e `fiscal.html`** (~600 linhas) — causa da divergência de `preco_unitario` | Médio |
| Auto-match NF-e usa `vinculos_nfe.fator_conversao` (stale) vs `insumo_fornecedores.qtd_por_embalagem` | Médio |
| Auditoria de Conversão cega p/ NF-e — não grava `quantidade_fornecedor` (relatorios.html:1685) | Médio |
| Custo da produção/sobra do PCP digitado à mão, não puxa `custoFichaPorcao` | Médio |
| `setPeriodoRange`/`esc`/`brl`/sidebar/tokens duplicados em várias telas | Baixo |

---

## 4. Problemas de banco

| Descrição | Impacto |
|---|---|
| **Migração de novo tenant não cria NENHUMA chave/constraint** (só `ADD COLUMN IF NOT EXISTS`; zero PK/FK/UNIQUE/INDEX). As do Mori foram feitas à mão (não versionadas). | **Alto** |
| **Tabelas em uso ausentes em qualquer migração** — `porcao_lancamentos`, `produtos`, `producao`, `ajustes_custo_medio` | **Alto** |
| **Colunas gravadas pelo código ausentes na migração** — `insumos.codigo_interno`; `fichas_tecnicas.preco_delivery`/`produto_id`; `entradas_estoque.nfe_numero`; `vendas_item.produto_nome/valor_unitario/categoria/canal` | **Alto** |
| **Schema de `pcp_producao`/`pcp_sobras` na migração ≠ código** → PGRST204 em tenant novo | **Alto** |
| `vendas_item` sem `loja_id` no PDV → custo usa loja arbitrária | Médio |
| Insumos sem exclusão protegida por FK → órfãos | Médio |

### Queries SQL de verificação (SQL Editor do Supabase, schema `public`)

```sql
-- 1) Status de inventário gravados
select distinct status from inventarios;

-- 2) Tabelas SEM primary key
SELECT t.table_name FROM information_schema.tables t
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints c
  WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.constraint_type='PRIMARY KEY');

-- 3) FKs existentes (e regra de delete)
SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name=tc.constraint_name
WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY' ORDER BY 1;

-- 4) UNIQUE/PK de saldo_estoque
SELECT c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c
WHERE c.conrelid='public.saldo_estoque'::regclass AND c.contype IN ('u','p');

-- 5) Órfãos (repetir trocando a tabela)
SELECT count(*) FROM itens_ficha i LEFT JOIN insumos x ON x.id=i.insumo_id WHERE x.id IS NULL;

-- 6) Tabelas "fantasma"
SELECT table_name FROM information_schema.tables WHERE table_schema='public'
AND table_name IN ('porcao_lancamentos','produtos','producao','ajustes_custo_medio','pcp_producao','pcp_sobras');

-- 7) Colunas gravadas pelo código
SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
AND (table_name,column_name) IN (('insumos','codigo_interno'),('fichas_tecnicas','preco_delivery'),
  ('fichas_tecnicas','produto_id'),('entradas_estoque','nfe_numero'),('vendas_item','loja_id'),
  ('vendas_item','produto_nome'));

-- 8) Colunas reais de pcp_producao/pcp_sobras
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name IN ('pcp_producao','pcp_sobras');

-- 13) Triggers/functions/views
SELECT event_object_table,trigger_name FROM information_schema.triggers WHERE trigger_schema='public';
SELECT routine_name FROM information_schema.routines WHERE routine_schema='public';
```

---

## 5. Problemas de interface

| Descrição | Sugestão |
|---|---|
| Header sticky ilegível (texto escuro sobre navy) em insumos.html:84 | remover `background:#0f2d5c` do sticky |
| Preview de conversão quebra — `${qtd_()}` (qtd_ é número) → TypeError (estoque.html:1992) | `${qtd(qtd_)}` |
| Unidade da produção fixa em 'un' — soma kg+un+porção (pcp.html:801) | derivar unidade real |
| `thead` navy copiado em ~18 telas (morto) | remover blocos inline |
| Filtro de período: 4 wrappers diferentes; `setPeriodoRange` em 4 telas | helper único no utils.js |
| Topbar com 6 alturas; tokens `:root` divergentes | padronizar `.topbar`; `var(--ds-primary)` |

---

## 6. Plano de Correção (do mais crítico ao cosmético)

### Bloco A — Bugs de cálculo ativos (one-liners)
1. `relatorios.html:1147` → `const precoUnit = e.custo_unitario;`
2. `loja.html:2718-2727` → `custo_unitario: custoUnit` + corrigir linhas já gravadas
3. `cmv.html:501` → ler `f.valor`
4. `fichas_tecnicas.html:579` → `c=>c>38`
5. `estoque.html:1992` → `${qtd(qtd_)}`

### Bloco B — Custo de ficha unificado
6. Tratar `un/pct/cx` em `custoFichaPorcao` (utils.js)
7. Migrar `fichas_tecnicas.html` para `custoDoInsumo`/`custoFichaPorcao` (fallback + divisão por porções)

### Bloco C — Banco / provisionamento (PRIORIDADE — novos clientes)
8. Rodar queries §4 → fotografar o schema real do Mori
9. Migration completa: PKs, UNIQUE(tenant_id,insumo_id,loja_id), FKs, CREATE TABLE das fantasmas
10. Sincronizar colunas faltantes + reescrever pcp_producao/pcp_sobras
11. `ajustes.html:837,879` → `on_conflict=tenant_id,insumo_id,loja_id`

### Bloco D — Coerência de relatórios
12. Inventário status `encerrado` nas 3 consultas + migrar legados
13. Dashboard CMV → definição oficial
14. Estorno NF-e → `custoMedioNaData`
15. Custo médio por data retroativa → recalcular/avisar
16. Convenção de saída (consumo) alinhada portal × sugestão
17. Produto processado → fonte única

### Bloco E — Produção
18. Decidir tabela canônica (`pcp_producao`), aposentar `producao.html`
19. Decidir elo Produção→Estoque ou documentar desligado
20. PCP puxa `custoFichaPorcao`; centralizar `vendaEstimada`

### Bloco F — Multi-loja (antes da 2ª loja)
21. getSaldo/Kardex/relatórios agregam por loja; `vendas_item.loja_id`; auto-match de fator; `quantidade_fornecedor` em NF-e; backfill modelo/modelo_processo

### Bloco G — Anti-duplicação (incremental)
22. Centralizar `registrarEntrada`/NF-e/`setPeriodoRange`/`esc`/`brl`/`upsertSaldo`

### Bloco H — Cosmético
23. Header sticky; navy morto; tokens; `.topbar`; filtro de período; histórico de ajuste

---

**Confirmado CORRETO (não mexer):** fonte única de custo (utils.js), custo médio ponderado, inventário atômico via RPC, markup/margem sem divisão por zero, valor de estoque consistente, divisão por fator já corrigida em estoque.html.

> ⚠️ Auditoria feita pelos AGENTES lendo o código (sem acesso ao banco ao vivo). Os achados de **banco (§4)** precisam ser confirmados rodando as queries no Supabase.
