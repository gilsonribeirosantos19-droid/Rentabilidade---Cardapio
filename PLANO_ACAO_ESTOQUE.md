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

- [x] ✅ **E6 · KPIs da tela de Saídas restaurados** (REG/faltando)
  Cards: Saídas hoje · Manuais hoje · Sem motivo · Última saída (data + insumo). Loja-filtrado.
  → `app/src/screens/Saidas.tsx`

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

- [ ] ⏸️ **E13 · ADIADO (de propósito) · Helper único de "média ponderada + histórico + vínculo"** (dedup MonitorNfe × Entradas)
  Motivo: é o **motor de custo** (entrada→saldo→custo médio→CMV). Refatorar aqui tem risco real pra uma limpeza de baixa prioridade. Fazer isolado, com teste dedicado, quando der. Sem impacto pro usuário hoje. → `lib/`
- [ ] ⏸️ **E15 · ADIADO (de propósito) · Trocar `alert()`/`confirm()` por modal/toast** (Entradas/Saídas)
  Motivo: puramente cosmético; o `confirm()` funciona (é o gate de saldo). Muita mexida de UI pra pouco valor. Fazer num pente-fino de UX depois. → `Entradas.tsx`, `Saidas.tsx`

---

## 🔵 FASE 4 — HERDADOS (já eram assim no HTML; decidir se corrige agora)

- [ ] ⏸️ **E17 · DECISÃO: Histórico do Ajuste de Custo Médio** — a tela lê a tabela `ajustes_custo_medio` que **ninguém preenche** → sempre vazia. Passar a gravar nela, ou remover a aba. → `AjusteCustoMedio.tsx:33`
- [ ] ⏸️ **E18 · DECISÃO: Reabrir inventário** — reabrir não estorna os ajustes; reabrir+reencerrar empilha. Avaliar estorno no reabrir. → `Inventario.tsx:162-166`
- [ ] ⏸️ **E19 · DECISÃO: Recalcular no cliente × cron SQL** — duas implementações da mesma regra (risco de divergir). Unificar num só (idealmente chamar a função do banco). → `Recalcular.tsx`
- [ ] ⏸️ **E20 · Fechamento sem trava no banco** — fechar/reabrir só valida no cliente. Avaliar trava por competência. → `Fechamento.tsx:143-148`

---

## ✅ Já validado como OK (não precisa mexer)
Entrada NF-e (média ponderada + histórico + vínculo + status + anti-duplicação) · conversão de unidade · transferência (saída origem + entrada destino) · encerramento de inventário pela RPC · Kardex/Saldo/Movimentação (reconstrução fiel) · Ajustes gravam movimento rastreável · Sugestão (fórmula, Tela 2 não grava em pedidos_compra, PDF real, gráficos do drawer).

---

### Progresso
- Fase 1 (Alta): ✅ 4/4
- Fase 2 (Média): ✅ 5/5
- Fase 3 (Baixa): 5/7 (E13/E15 adiados de propósito — refactor/cosmético)
- Fase 4 (Herdados/decisão): 0/4
