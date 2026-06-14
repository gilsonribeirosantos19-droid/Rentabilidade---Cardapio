# Bloco F — Multi-loja (a corrigir depois)

> **O que é:** deixar o sistema correto quando um tenant tem **várias lojas** (ex.: Sushi Ponta Negra, 8 lojas). Cada loja tem seu estoque e seu custo; o sistema separa por loja, soma em "Todas as lojas", não deixa dado órfão, e abre na loja certa.
>
> **Latente:** só aparece com **2+ lojas** no mesmo tenant. Tenant de 1 loja (Mori) auto-seleciona a loja e não vê nada disso.
>
> **Regra-base confirmada na validação (2026-06-14):**
> - **"Todas as lojas" = só CONSULTA** (dashboard, relatórios, movimentação, saldo consolidado).
> - **Lançamento (entrada/saída/ajuste/custo de ficha) exige loja específica** — senão o dado fica órfão (loja_id nulo), some dos relatórios por loja e cria divergência.

---

## ✅ JÁ FEITO (validação 2026-06-14, em produção)

- Bloqueio de gravar **entrada/saída/min-máx sem loja** + trava no `upsertSaldo` (estoque.html) — commit `7cb095e`.
- Trocar de loja **atualiza** Movimentação/Sugestão/Saldo (estoque.html `carregar()`) — commit `109d66d`.
- "Todas as lojas" **recarrega** o consolidado (estoque.html `onLojaChange`, removido `if(!lojaAtual) return`) — commit `a17913d`.
- **Ficha** abre sempre com uma loja selecionada (a do usuário, senão a 1ª) — fichas_tecnicas.html `carregarLojas` — commit `3223163`.
- **Portal do gerente** mostra a loja do gerente logado (`sb_user.loja_id`) — portal_gerente.html — commit `d359ad0`.

---

## ⏳ FALTA FAZER

### 1. Varrer as outras telas de LANÇAMENTO (mesmo bloqueio "exige loja")
Só o **estoque.html** ganhou o bloqueio. Aplicar o mesmo padrão em:
- **ajustes.html** — funções que gravam ajuste/saldo (tem seu próprio upsertSaldo/insert).
- **porcionamento.html** — lançamentos de porção (gravam movimentação por loja).
- Conferir também qualquer outra tela que escreve em `saldo_estoque`/`entradas_estoque`/`saidas_estoque`.
- Padrão: `if(!getLojaId()){ toast('Selecione uma loja específica...'); return; }` + trava no upsertSaldo local de cada arquivo.

### 2. Ficha com "Todas as lojas" → custo de referência (não R$0)
- fichas_tecnicas.html: custo do ingrediente (`~linha 857`) vem do `_saldosLoja` (custo médio da loja). Com "Todas as lojas" (`onChangeLojaFT ~1108`) o `_saldosLoja` fica `[]` → custo cai pra `preco_compra` (vazio nos insumos via NF-e) → **R$0**.
- Contornado abrindo numa loja. **Melhoria:** com "Todas", usar fallback (preco_compra OU custo médio agregado/qualquer loja) pra não mostrar R$0.

### 3. Estoque abrir já na loja do usuário (igual à ficha)
- estoque.html: hoje abre em "Todas as lojas" por padrão (sel-loja value=""). Fazer abrir na `sb_user.loja_id` (senão 1ª loja), como em fichas_tecnicas.html `carregarLojas`. Evita o atrito do bloqueio e o custo R$0.

### 4. (Segurança) Travar o gerente na própria loja
- O seletor de loja mostra **todas** as lojas do tenant pra qualquer usuário. O ideal: **gerente** só enxerga/seleciona a **própria loja** (`usuarios.loja_id`); admin vê todas. Hoje um gerente do Centro poderia ver dados da Ponta Negra.
- Relacionado: tabela `usuarios_lojas` (many-to-many) existe — decidir se o acesso multi-loja vem dela.

### 5. Conferir agregações em "Todas as lojas" nos demais relatórios
- Movimentação já validada (soma certo). Conferir os outros: **custo médio consolidado** (média ponderada entre lojas, não simples), Kardex, Dashboard por loja vs total, CMV.

---

## Quando fazer
Idealmente **junto com o cadastro do Sushi Ponta Negra (8 lojas)** — aí dá pra testar no cenário real. Mas os itens **1 e 3** dá pra fazer e testar **agora** (o sandbox "Ambiente de Testes" já tem 2 lojas: Centro + Ponta Negra).

## Relacionado
- Provisionamento de cliente novo: `PROVISIONAR_CLIENTE.md`
- Vinculação gerente→loja: Configurações → Usuários → role "Gerente" → "Loja vinculada" (`usuarios.loja_id`). Admin não tem loja fixa.
