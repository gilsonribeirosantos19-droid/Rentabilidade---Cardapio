# Elo Produção (PCP) → Estoque — ESPECIFICAÇÃO (implementar junto com o PDV)

> **Status: DESENHADO, NÃO IMPLEMENTADO (decisão do cliente, 2026-06).**
> Hoje o PCP (`pcp.html`) só **aponta produção** (controle + relatórios). **Não mexe no estoque.**
> O elo abaixo só será **implementado e ligado quando o PDV (Saipos) estiver integrado** — porque sem o PDV a venda não baixa estoque, e mexer no estoque só pela produção desbalancearia o saldo. Ver `project-integracao-pdv-saipos` e `project-baixa-estoque-manual`.

---

## Decisões do cliente (registradas)

1. **Apontar os dois** (semiacabados E pratos prontos) no PCP, com objetivos diferentes:
   - **Hoje:** ambos servem só pra **controle do que foi produzido + relatórios**.
   - **Futuro:** ao ligar o elo, **só semiacabado** (ficha com `insumo_vinculado_id`) movimenta estoque. Prato pronto continua sem mexer no estoque (sai na venda, via PDV).
2. **Estoque insuficiente → deixa produzir** (não bloqueia; no máximo avisa). Saldo pode ficar negativo.
3. **Ativação por chave** — um parâmetro liga/desliga o elo (default DESLIGADO). Liga quando o PDV estiver pronto.

---

## Comportamento quando LIGADO

Ao salvar uma produção de **Q** unidades de uma ficha que é **semiacabado** (`insumo_vinculado_id` preenchido):

1. **Fator de batelada** = `Q_em_gramas / rendimento_receita_g` da ficha.
   - `Q_em_gramas`: converter `produzido` (unidade do PCP) para a unidade de `rendimento_receita_g`. Se o semiacabado é por `un`, tratar 1 batelada = `rendimento_receita_g` produz `rendimento_porcoes`/`un` — definir a regra de conversão na hora (caso de `un` vs `g/kg`).
2. **Baixa (saída)** de cada ingrediente da ficha: `itens_ficha.quantidade_g × fator_batelada` → `saidas_estoque`, `tipo='producao'`.
3. **Entrada** do semiacabado vinculado: `Q` (na unidade de estoque do insumo) → `entradas_estoque`, `tipo='producao'`, custo = **custo da receita** (`custoFichaTotal / rendimento`).
4. **Recalcula custo médio** do semiacabado (média ponderada — mesma fórmula de `registrarEntrada` em estoque.html:2041).

## Robustez (igual ao fechamento de inventário, RPC atômica)

- Implementar como **RPC Postgres `registrar_producao_estoque(p_producao_id)`** — transação: ou faz tudo, ou nada.
- **Reversível:** marcar os movimentos com `origem='producao'` + `documento_ref = pcp_producao.id`. Ao **editar/excluir** uma produção, a RPC **estorna** os movimentos antigos daquele `documento_ref` e refaz com os novos números (não duplica baixa).
- Frontend (`pcp.html` → `salvarProd`/`deletarProd`): depois de gravar `pcp_producao`, chamar a RPC **se** o parâmetro `producao.integrar_estoque` estiver ligado E a ficha tiver `insumo_vinculado_id`.

## Pontos de atenção (resolver na implementação)

- **Unidades:** `pcp_producao.unidade` (un/kg) × `insumos.unidade_medida` × unidade de `rendimento_receita_g`. Padronizar a conversão pra gramas. Maior risco de bug — testar com Shari (kg) e um item por `un`.
- As funções `registrarEntrada`/`upsertSaldo`/saída vivem **dentro do estoque.html** — não estão no utils.js. A RPC no banco evita depender disso (faz tudo no SQL). Alternativa: centralizar essas funções no utils.js (Bloco G) e chamar do PCP.
- `pcp.html` precisará carregar `insumos`, `saldo_estoque` e `itens_ficha` (hoje carrega só fichas/pcp_producao) — ou delegar tudo à RPC.

## Quando implementar

Junto com a **Fase 3 do Saipos** (ingestão de vendas). Ver backlog `project-pendencias` item Saipos e `PRODUCAO_ESTOQUE_ELO.md` (este arquivo).
