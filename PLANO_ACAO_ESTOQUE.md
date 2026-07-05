# 📋 Plano de Ação — Revisão do Módulo ESTOQUE (pós-migração React)

> Legenda de status: ⬜ a fazer · 🟦 em andamento · ✅ feito · ⏸️ adiado/decisão pendente
> Tipo: **REG** = regressão da migração · **NOVO** = bug em código novo · **HER** = herdado do HTML (já era assim) · **DEC** = precisa de decisão sua

---

## 🔴 FASE 1 — ALTA ✅ CONCLUÍDA (commit b57edab? ver git)

- [x] ✅ **E1 · Saídas respeitarem `permitir_negativo`** (REG)
  Carrega o parâmetro (`parametros`, modulo=estoque) e **bloqueia** a saída que supera o saldo quando 'nao'; senão pede `confirm()` (default = permite, fiel ao HTML).
  → `app/src/screens/Saidas.tsx`

- [x] ✅ **E2 · Sugestão: status `baixado`/`processado` = recebido** (NOVO)
  Adicionados a `RECEBIDO` → não contam mais como "Pedido Aberto".
  → `app/src/screens/SugestaoCompra.tsx`

- [x] ✅ **E3 · Sugestão: paginação (fetchAll)** (NOVO)
  insumos/saldos/saídas/pedidos/itens_pedido agora usam `fetchAll` (sem cap de 1000).
  → `app/src/screens/SugestaoCompra.tsx`

- [x] ✅ **E4 · Mínimo com fallback pro `insumos.minimo`** (NOVO)
  `saldo_estoque.minimo` vazio → cai no `insumos.minimo`. Aplicado na **Sugestão** e no **Portal/Estoque**.
  → `SugestaoCompra.tsx`, `PortalEstoque.tsx`

---

## 🟡 FASE 2 — MÉDIA (4/5 ✅ · falta só a decisão E8)

- [x] ✅ **E5 · Validar `obrigar_lote` na entrada manual** (REG)
  Bloqueia salvar entrada sem lote quando o parâmetro `estoque.obrigar_lote` = 'sim'.
  → `app/src/screens/Entradas.tsx`

- [x] ↩️ **E6 · KPIs de Saídas — REVERTIDO a pedido do usuário (2026-07-03)**
  Eu tinha restaurado os KPIs, mas o usuário decidiu **remover os cards** (não os queria de volta). Removidos das telas de **Saídas E Entradas** (os de Entradas eram pré-existentes). Filtro de Motivo (E10) foi mantido.
  → `app/src/screens/Saidas.tsx`, `app/src/screens/Entradas.tsx`

- [x] ✅ **E7 · Ajuste de Custo Médio grava `motivo`/`observação`** (REG)
  Campo "Motivo / observação" adicionado; anexado na observação do movimento.
  → `app/src/screens/AjusteCustoMedio.tsx`

- [x] ✅ **E8 · DECISÃO: filtro por loja em Movimentação/Kardex — MANTER** (decidido 2026-07-03)
  Usuário escolheu manter o filtro por loja (novo, mais correto). Nenhuma mudança de código.
  → `Movimentacao.tsx`, `Kardex.tsx`

- [x] ✅ **E9 · Constraint do `onConflict` — VALIDADA** (verificação)
  A saída/entrada manual já usa `onConflict: 'tenant_id,insumo_id,loja_id'` e funciona em produção → a constraint existe. Sem ação.

---

## 🟢 FASE 3 — BAIXA (refino / limpeza) — 5/7 feitos

- [x] ✅ **E10 · Filtro "Motivo" em Saídas** → `Saidas.tsx` (novo select de motivo)
- [x] ✅ **E11 · Contador "X/Y contados" na lista de Inventário** → `Inventario.tsx` (nova coluna Contagem)
- [x] ✅ **E12 · Entrada grava `responsavel`; NF-e grava `documento_ref` no histórico** → `Entradas.tsx`, `MonitorNfe.tsx`
- [x] ✅ **E14 · `fetchAll` duplicado removido → importa de `lib/db`** → `SaldoEstoque.tsx`
- [x] ✅ **E16 · Sugestão: custo PONDERADO por qtd + comentário atualizado + Exportar CSV real** → `SugestaoCompra.tsx`

- [x] ✅ **E13 · FEITO (subset seguro) · Fórmula única da média ponderada** (dedup MonitorNfe × Entradas)
  Extraída `mediaPonderada()` pura pro `lib/cost.ts` e usada em `Entradas` (saveMut) e `MonitorNfe` (registrarEntradaNfe). O **fluxo de gravação** (insert + saldo + histórico + vínculo) foi mantido em cada tela — só a **conta** ficou centralizada (risco baixo). Unificar o fluxo inteiro num helper de banco NÃO foi feito de propósito (as telas montam payloads diferentes). → `lib/cost.ts`, `Entradas.tsx`, `MonitorNfe.tsx`
- [x] ✅ **E15 · FEITO (subset) · `alert()` de "Ver detalhes" → mini-modal** (Entradas/Saídas)
  Criado `components/DetailModal.tsx` (reutilizável, usa `.ov/.modal`). Os `alert()` de detalhe viraram modal. Os `confirm()` dos gates (excluir/estornar/supera saldo) foram **mantidos de propósito** — funcionam e trocá-los é muita mexida de fluxo pra pouco valor. → `DetailModal.tsx`, `Entradas.tsx`, `Saidas.tsx`

---

## 🔵 FASE 4 — HERDADOS ✅ (4/4 — E19/E20 dependem de RODAR o SQL `estoque_fase4_recalc_e_trava.sql`)

- [x] ✅ **E17 · Histórico do Ajuste de Custo Médio** — agora lê os MOVIMENTOS reais (entradas_estoque tipo 'ajuste', qtd 0). A tabela `ajustes_custo_medio` órfã foi abandonada. → `AjusteCustoMedio.tsx`
- [x] ✅ **E18 · Reabrir inventário** — aviso forte adicionado. ⚠️ ACHADO: a RPC `encerrar_inventario` **reconcilia na data da contagem e NÃO empilha** (no reencerrar, v_diff≈0). O risco do agente não se confirma na prática — o aviso é só UX de segurança. → `Inventario.tsx`
- [x] ✅ **E19 · Recalcular via função do banco** — botão chama a RPC `recalc_custo_medio` (fonte única) com fallback pro cálculo no cliente. ⚠️ RODAR o SQL pra ativar. → `Recalcular.tsx` + `estoque_fase4_recalc_e_trava.sql`
- [x] ✅ **E20 · Trava de fechamento no banco** — trigger que bloqueia alterar competência já 'fechado' (reabrir = DELETE segue ok). ⚠️ RODAR o SQL. → `estoque_fase4_recalc_e_trava.sql`

---

## ✅ Já validado como OK (não precisa mexer)
Entrada NF-e (média ponderada + histórico + vínculo + status + anti-duplicação) · conversão de unidade · transferência (saída origem + entrada destino) · encerramento de inventário pela RPC · Kardex/Saldo/Movimentação (reconstrução fiel) · Ajustes gravam movimento rastreável · Sugestão (fórmula, Tela 2 não grava em pedidos_compra, PDF real, gráficos do drawer).

---

### Progresso
- Fase 1 (Alta): ✅ 4/4
- Fase 2 (Média): ✅ 5/5
- Fase 3 (Baixa): 5/7 (E13/E15 adiados de propósito — refactor/cosmético)
- Fase 4 (Herdados/decisão): ✅ 4/4 (E19/E20 dependem de rodar o SQL)

**⚠️ AÇÃO DO USUÁRIO:** rodar `estoque_fase4_recalc_e_trava.sql` no Supabase (ativa E19 e E20).
