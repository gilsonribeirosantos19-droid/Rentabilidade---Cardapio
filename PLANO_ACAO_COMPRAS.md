# 📋 Plano de Ação — Revisão do Módulo COMPRAS (pós-migração React)

> Legenda: ⬜ a fazer · ✅ feito · ⏸️ adiado/decisão · Tipo: REG=regressão · BUG · LACUNA · FRAG=fragilidade
> Telas: `Compras.tsx` (Pedidos de Compra: Solicitações→Processar→Pedidos Gerados) · `SugestaoCompra.tsx` (Sugestão do sistema, autocontida).
> Base de comparação: `compras.html` (HTML antigo).

---

## ✅ FEITO (correções seguras)

- [x] ✅ **C1 · Parâmetros de Compras ligados** (REG + promessa quebrada)
  `exigir_aprovacao` e `permitir_sem_fornecedor` apareciam ATIVOS em Configurações mas NÃO faziam nada (no HTML `exigir_aprovacao` era código morto; `permitir_sem_fornecedor` funcionava e o React tinha perdido). Agora, no `Processar`/`gerarMut`:
  · `permitir_sem_fornecedor=nao` → bloqueia gerar se houver item sem fornecedor.
  · `exigir_aprovacao=sim` → pedido nasce `aguardando_aprovacao`; senão nasce `pendente` (comportamento atual, default).
  · Adicionada ação **Aprovar** no modal do pedido (`aguardando_aprovacao` → `pendente`) + opção de filtro "Aguardando aprovação" + incluído em "Ativos".
  → `Compras.tsx` (Processar, VerPedido). ⚠️ Refinamento futuro: aprovação por PERFIL/alçada (hoje qualquer um no admin aprova; `aprovar_acima_valor` segue "em breve").

- [x] ✅ **C2 · `fetchAll` nas 3 queries de `pedidos_compra`** (BUG paginação)
  Solicitações, Processar (sols) e Pedidos Gerados passavam do teto de 1000 linhas. Agora paginam.
  → `Compras.tsx`

- [x] ✅ **C3 · WhatsApp anexa a observação do pedido** (REG)
  A msg de WhatsApp voltou a incluir o `pedido.observacao` (resumo "Lojas: ...") como no HTML.
  → `Compras.tsx` (enviarWhats)

---

## ✅ FEITO (decisões do usuário 2026-07-03)

- [x] ✅ **C4 · Romaneio consolidado "Baixar todos (por loja)"** (LACUNA) — usuário: construir.
  Botão na aba Pedidos Gerados imprime 1 folha por loja com todos os itens consolidados dos pedidos LISTADOS (respeita o filtro atual). Portado fiel do HTML (`gerarImpressaoPorLoja`), agrupa por loja pelo breakdown da observação do item; lojas via `select('*')`. → `Compras.tsx`

- [x] ✅ **C5 · Consumo/dia da Sugestão pelos dias REAIS cobertos** (BUG) — usuário: corrigir.
  `consMap` agora divide o total de saídas pelos dias efetivamente cobertos (1ª saída → hoje, no máx. o período), não pelo período cheio. Insumo/loja novo deixa de ser subestimado. Incluído `criado_em` na query de saídas. → `SugestaoCompra.tsx`

## ✅ Verificado e descartado

- [x] ✅ **C6 · Fallback de "grupo" — NÃO se aplica.** A coluna `grupo` existe em `produtos`, NÃO em `insumos`. No pedido a coluna é do insumo → `categoria` é a canônica. O `ins?.grupo` do HTML apontava pra campo inexistente (sempre vazio). Sem mudança.

---

## ⏸️ ADIADO (estrutural, herdado do HTML — baixo valor/alto toque)

- [ ] ⏸️ **C7 · Lojas derivadas de parse de texto (regex na observação)** (FRAG)
  A contagem/rateio de lojas na aba "Pedidos Gerados" vem de `observacao.match(/Lojas: .../)` + `split(',')` — infla se o nome da loja tiver vírgula, e o PDF por loja casa por nome (quebra se a loja for renomeada). Correção real = persistir loja_id/qtd estruturado no item. Herdado do HTML; refatorar depois.

---

## ✅ Verificado como OK (não é bug)
- `SugestaoCompra` usa `fetchAll` em tudo · `itens_pedido` sem `tenant_id` (consulta por `pedido_id`) é a regra do projeto · Tela 2 da Sugestão autocontida (só PDF) · custo ponderado com fallback sem divisão por zero · status `processado`/`cancelado` fora de "pedido aberto".
- Achado do agente sobre "status inicial `aprovado`" = FALSO: o HTML calculava `_statusInicial` mas nunca usava (inseria `pendente`, igual ao React).
