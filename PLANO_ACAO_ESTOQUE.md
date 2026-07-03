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

## 🟡 FASE 2 — MÉDIA (corrigir em seguida)

- [ ] ⬜ **E5 · Validar `obrigar_lote` na entrada manual** (REG)
  Bloquear salvar entrada sem lote quando o parâmetro estiver ligado.
  → `app/src/screens/Entradas.tsx:85-104`

- [ ] ⬜ **E6 · Restaurar KPIs da tela de Saídas** (REG/faltando)
  Cards: saídas hoje · saídas manuais hoje · última saída · saídas sem motivo.
  → `app/src/screens/Saidas.tsx`

- [ ] ⬜ **E7 · Ajuste de Custo Médio gravar `motivo`/`observação`** (REG)
  Voltar a anexar motivo + observação no movimento (rastreabilidade).
  → `app/src/screens/AjusteCustoMedio.tsx:58`

- [ ] ⏸️ **E8 · DECISÃO: Movimentação/Kardex filtrarem por loja?** (DEC)
  Hoje o React **filtra pela loja do topo**; o HTML **agregava todas as lojas**. Provável melhoria — **você decide** se mantém (recomendo manter) ou volta ao comportamento antigo.
  → `Movimentacao.tsx`, `Kardex.tsx`

- [ ] ⬜ **E9 · Validar a constraint do `onConflict` dos Ajustes** (verificação)
  Confirmar no banco que a constraint única de `saldo_estoque` é `(tenant_id, insumo_id, loja_id)`; senão o upsert dos Ajustes falha.
  → `AjusteEstoque.tsx:76`, `AjusteCustoMedio.tsx:57`

---

## 🟢 FASE 3 — BAIXA (refino / limpeza)

- [ ] ⬜ **E10 · Filtro "Motivo" em Saídas** (faltando) → `Saidas.tsx`
- [ ] ⬜ **E11 · Contador "X/Y contados" na lista de Inventário** (faltando) → `Inventario.tsx`
- [ ] ⬜ **E12 · Entrada manual gravar `responsavel` e `documento_ref`** → `Entradas.tsx`
- [ ] ⬜ **E13 · Refatorar: helper único de "média ponderada + histórico + preço do vínculo"** (tira duplicação MonitorNfe × Entradas) → `lib/`
- [ ] ⬜ **E14 · `fetchAll` duplicado local no Saldo de Estoque → importar de `lib/db`** → `SaldoEstoque.tsx:20-30`
- [ ] ⬜ **E15 · Trocar `alert()`/`confirm()` nativos por modal/toast do padrão novo** → `Entradas.tsx`, `Saidas.tsx`
- [ ] ⬜ **E16 · Sugestão: custo ponderado (não máx entre lojas) + limpar comentário + botão "Exportar"** → `SugestaoCompra.tsx`

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
- Fase 2 (Média): 0/5
- Fase 3 (Baixa): 0/7
- Fase 4 (Herdados/decisão): 0/4
