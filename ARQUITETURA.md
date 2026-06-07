# Arquitetura de Dados — Aiko Sistema

> Documento técnico de referência. Define o **padrão oficial** de como os dados
> fluem entre cadastros, movimentações e relatórios, e as **fórmulas** que todos
> os módulos devem seguir. Atualizar este arquivo sempre que uma regra mudar.

Última revisão: 2026-06-07 (gerado a partir da auditoria de arquitetura).

---

## 1. Visão geral

- **Stack:** HTML/CSS/JS puro + Supabase (PostgREST). Sem framework, sem servidor.
- **Multi-tenant:** tudo filtra por `tenant_id`. Hoje opera com tenants fixos
  (padrão `00000000-0000-0000-0000-000000000001` e Mori Izakaya `33e81daf-...`).
- **Multi-loja:** estoque é por **loja** (`loja_id`). Cadastros (insumos, fichas)
  são **globais** do tenant (sem `loja_id`).
- **Chaves:** telas internas (admin) usam `service_role`; o portal do gerente
  (`loja.html`) e telas de operador usam a chave **anon** (RLS aplicado → todo
  insert/upsert precisa de `tenant_id`).

---

## 2. Tabelas principais

| Tabela | Por loja? | Papel |
|---|---|---|
| `insumos` | não (global) | Cadastro de matéria-prima. `codigo_interno` (sequencial), `preco_compra`, `rendimento_pct`, `categoria`, `participa_cmv`, `tipo_baixa`, `unidade_medida`. |
| `fichas_tecnicas` | não | Receitas. `preco_venda`, `rendimento_porcoes`, `insumo_vinculado_id` (processados). |
| `itens_ficha` | não | Ingredientes da ficha: `ficha_id`, `insumo_id`, `quantidade_g`. |
| `saldo_estoque` | **sim** | Posição atual: `quantidade`, **`custo_medio`**. Chave única `(tenant_id, insumo_id, loja_id)`. |
| `entradas_estoque` | sim | Entradas: `quantidade`, `custo_unitario` (por unidade de estoque), `tipo` (nfe/manual/ajuste), `nfe_numero`. |
| `saidas_estoque` | sim | Saídas: `quantidade`, `tipo` (consumo/perda/vencimento/transferencia/descarte/ajuste), `motivo`. |
| `historico_custo` | sim | Auditoria de variação de custo a cada entrada. |
| `insumo_fornecedores` | não | Vínculo item↔fornecedor: `codigo_fornecedor`, `embalagem_descricao`, **`qtd_por_embalagem`** (conversão), `preco_unitario`, `embalagem_padrao`. |
| `fornecedores` | não | Cadastro de fornecedores (`cnpj`). |
| `nfe_recebidas` | não | NF-e recebidas (FocusNFe). `status` (em_transito/pronta/aguard_vinculacao/processada). |
| `nfe_itens` | não | Itens da NF-e. `vinculacao_id` → `insumo_fornecedores.id`. |
| `vinculos_nfe` | não | Auto-match NF-e→insumo (`fator_conversao`). ⚠️ duplica `qtd_por_embalagem`. |
| `vendas_item` | (ver §7) | Vendas do PDV: `produto_nome`, `ficha_id`, `quantidade`, `valor_total`, `custo_unitario`. |
| `pedidos_compra` / `itens_pedido` | loja no pedido | Solicitações/pedidos de compra. |
| `perdas` / `perdas_itens` | loja na perda | Perdas lançadas no portal. |
| `inventarios` / `inventario_itens` | sim | Contagem de inventário (`qtd_contada`). |

---

## 3. Mapa módulo → tabelas (R = lê, W = grava)

| Módulo (arquivo) | Lê | Grava |
|---|---|---|
| Insumos (`insumos.html`) | insumos, saldo_estoque | insumos |
| Fichas Técnicas (`fichas_tecnicas.html`) | fichas_tecnicas, itens_ficha, insumos | fichas_tecnicas, itens_ficha, insumos (`preco_compra`) |
| Estoque (`estoque.html`) | tudo de estoque + nfe + vínculos | saldo_estoque, entradas_estoque, saidas_estoque, inventarios, historico_custo, insumo_fornecedores |
| Fiscal (`fiscal.html`) | nfe_*, insumo_fornecedores, insumos, fornecedores | nfe_*, vinculos_nfe, insumo_fornecedores, entradas_estoque, saldo_estoque, historico_custo |
| Entradas Processadas (`entradas_processadas.html`) | nfe_recebidas, nfe_itens, entradas/saidas | entradas_estoque (estorno), saldo_estoque (estorno), nfe_recebidas |
| Compras (`compras.html`) | pedidos_compra, itens_pedido, insumo_fornecedores, grupos_compra | pedidos_compra, itens_pedido |
| CMV (`cmv.html`) | fichas, itens_ficha, insumos, saidas_estoque, saldo_estoque | — (só leitura) |
| PDV (`pdv.html`) | vendas_item, fichas, itens_ficha, insumos | vendas_item |
| Relatórios (`relatorios.html`) | saidas, entradas, fichas, insumos | — (só leitura) |
| Portal (`loja.html`) | insumos, fichas, estoque | inventario_itens, saidas/entradas, pedidos, perdas (com `tenant_id`) |

---

## 4. Fórmulas oficiais

### 4.1 Custo médio (ponderado) — PADRÃO ÚNICO
A cada **entrada**:
```
custo_medio_novo = (qtd_ant × custo_medio_ant + qtd_entrada × custo_entrada)
                   / (qtd_ant + qtd_entrada)
```
- **Saída NÃO altera o custo médio** (só reduz quantidade).
- Em recálculo do zero (estorno, saldo por data): `custo_medio = Σ(qtd × custo) / Σ(qtd)` sobre as **entradas restantes** (equivalente à ponderada).

### 4.2 Saldo de estoque
```
saldo_qtd = Σ entradas − Σ saídas        (por insumo + loja)
valor_em_estoque = saldo_qtd × custo_medio
```

### 4.3 Conversão NF-e → estoque
```
qtd_estoque  = qtd_da_nota × qtd_por_embalagem
custo_unit   = valor_unitario_da_nota ÷ qtd_por_embalagem   (por unidade de estoque)
```
Ex.: caixa com 24 un × 2 caixas = 48 un. | Caixa de 9 kg × 4 = 36 kg.
Auto-preenchimento lê o nome da embalagem ("CAIXA C/ 9 KG"→9, "20x900ml"→18 L).

### 4.4 CMV Real
```
CMV_real = Σ (saídas de consumo × custo_medio)
```
⚠️ Hoje as saídas de consumo são **manuais** (PDV não baixa estoque) — ver §7.

### 4.5 CMV Teórico
```
consumo_teorico(insumo) = Σ vendas × (quantidade_g do insumo na ficha ÷ rendimento_porcoes)
CMV_teorico = Σ (consumo_teorico × custo_medio)
```

### 4.6 Sugestão de compras
```
sugestao = max(0, consumo_medio_diario × dias_cobertura − estoque_atual)
consumo_medio_diario = Σ(saídas de consumo no período) ÷ dias_do_periodo
```

### 4.7 Curva ABC (por faturamento)
```
ordena produtos por faturamento desc; acumula %:
  A = acumulado ≤ 80% | B = ≤ 95% | C = resto
```

### 4.8 Engenharia de cardápio
```
popularidade = quantidade_vendida ≥ média_de_quantidade
margem = (faturamento − custo) / faturamento ≥ média_de_margem
  alta pop. + alta margem = Joia | alta pop. + baixa margem = Estrela
  baixa pop. + alta margem = Abacaxi | baixa + baixa = Quebra-cabeça
```

---

## 5. ⭐ Fonte ÚNICA de custo (REGRA OFICIAL)

> **A fonte oficial de custo de um insumo é `saldo_estoque.custo_medio`** (da loja).
> Fallback, nesta ordem, só quando não houver custo médio:
> 1. `saldo_estoque.custo_medio`
> 2. `insumo_fornecedores.preco_unitario` (último preço de compra)
> 3. `insumos.preco_compra`

**Todo** relatório que precisa de custo (CMV por produto, Engenharia, CMV teórico/real,
ficha técnica) deve usar a **mesma função** `custoDoInsumo(insumoId, lojaId)` seguindo
essa ordem. É proibido cada tela inventar a própria fonte.

> Status: **a padronizar** (hoje o PDV usa `vendas_item.custo_unitario` digitado, e
> o CMV usa `custo_medio` — fontes diferentes geram CMV divergente para o mesmo produto).

---

## 6. Padrões e validações obrigatórias

- Sempre filtrar por `tenant_id`. Estoque/movimentação sempre por `loja_id`.
- Conversão de embalagem **nunca** deve cair em fator 1 silencioso — avisar se faltar.
- Entrada exige `custo_unitario > 0`. Saída de perda exige `motivo`.
- Venda deveria exigir ficha técnica (ou custo) — senão CMV/ margem ficam falsos.
- Não permitir estoque negativo (parâmetro `permitir_negativo`, padrão **false**).

---

## 7. ⚠️ Divergências conhecidas (a corrigir)

1. **CMV com 3 fontes de custo** (PDV digitado × custo médio) → mesmo produto, CMV
   diferente em telas diferentes. **(prioridade alta — ver §5)**
2. **Venda (PDV) não baixa estoque** — `vendas_item` não gera `saidas_estoque`.
   Logo o **CMV Real não reflete vendas** e o "Teórico × Real" não fecha.
   Decisão pendente: PDV passar a baixar estoque, ou manter baixa manual.
3. **Custo histórico vs atual:** Kardex usa o custo do momento (certo); Movimentação
   e Fechamento valorizam movimentos passados com o custo médio **de hoje** → divergem.
4. **Inventário** sobrescreve `saldo_estoque` sem gerar ajuste rastreável.
5. **Duplicação:** `vinculos_nfe.fator_conversao` repete `insumo_fornecedores.qtd_por_embalagem`;
   custo aparece em `insumos.preco_compra` e `saldo_estoque.custo_medio`.
6. **Sem painel central de divergências** (itens sem vínculo, custo zerado, venda sem
   ficha, estoque negativo).
7. `vendas_item` possivelmente sem `loja_id` — risco ao operar com mais de uma loja.

---

## 8. Roadmap de padronização

1. Implementar `custoDoInsumo()` e ligar todas as telas de CMV (resolve §7.1).
2. Decidir e implementar o elo Venda↔Estoque (§7.2).
3. Painel de Divergências (§7.6).
4. Inventário com movimento de ajuste rastreável (§7.4).
5. Unificar fator de conversão numa tabela só (§7.5).
