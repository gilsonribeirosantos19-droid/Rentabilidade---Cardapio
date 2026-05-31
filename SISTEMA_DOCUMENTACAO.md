# Documentação do Sistema — Aiko Gestão de Restaurante

**Versão:** 1.0  
**Atualizado em:** Maio/2026  
**Desenvolvido para:** Sushi Ponta Negra

---

## O que é o sistema?

O Aiko é uma plataforma web de gestão operacional e financeira para restaurantes do grupo Sushi Ponta Negra. Ele centraliza o controle de custos, fichas técnicas, estoque, processamento de insumos e planejamento de produção em um único lugar, acessível por qualquer dispositivo com navegador.

O sistema é **multi-loja** — cada unidade opera de forma independente dentro da mesma plataforma, com dados segregados por loja. Toda movimentação de custo, estoque e processamento é registrada por loja.

---

## Módulos do Sistema

### 1. Insumos
**Arquivo:** `insumos.html`

Cadastro central de todos os ingredientes e matérias-primas utilizados nas receitas e no estoque.

**O que registra:**
- Nome do insumo
- Unidade de medida (kg, g, litro, ml, un)
- Unidade de compra (como é comprado do fornecedor)
- Preço de compra (R$/kg ou R$/unidade)
- Rendimento percentual (% de aproveitamento após limpeza/perda natural)
- Status ativo/inativo

**Como funciona o custo real:**  
`Custo real/kg = Preço de compra ÷ (Rendimento % ÷ 100)`

Exemplo: Salmão comprado a R$ 50/kg com 85% de rendimento → custo real = R$ 58,82/kg.

---

### 2. Fichas Técnicas
**Arquivo:** `fichas_tecnicas.html`

Receituário completo do cardápio. Cada ficha representa um produto vendável e define os ingredientes, quantidades, custo e indicadores financeiros.

**O que registra:**
- Nome da ficha e categoria (temaki, sushi, uramaki, sashimi, combo, prato, bebida, etc.)
- Rendimento (quantas unidades a receita produz)
- Lista de ingredientes com quantidade em gramas
- Preço de venda
- Status (ativa, rascunho, arquivada)

**Indicadores calculados automaticamente:**
- **Custo total** — soma dos custos de cada ingrediente
- **CMV%** (Custo da Mercadoria Vendida) — custo ÷ preço de venda × 100
- **Markup** — preço de venda ÷ custo
- **Margem (R$)** — preço de venda − custo
- **Margem%** — margem ÷ preço de venda × 100

**Semáforo CMV:**
- 🟢 Verde (≤30%): excelente
- 🟡 Amarelo (≤38%): atenção
- 🔴 Vermelho (>38%): crítico

**Seletor de loja:**  
Ao selecionar uma loja, o sistema usa o **custo médio** daquela loja (calculado no estoque) em vez do preço de compra padrão, refletindo o custo real praticado por unidade.

**Fichas de processados:**  
Produtos como Shari (arroz temperado) e molhos podem ser vinculados a um insumo existente. Ao salvar a ficha, o custo por kg do processado é atualizado automaticamente no cadastro do insumo.

**Painel de detalhe:**  
Ao clicar em uma ficha, abre um painel lateral com:
- Tabela de ingredientes (ingrediente, categoria, quantidade, custo, % do custo total)
- Resumo financeiro (custo, preço de venda, CMV%, margem, markup)
- Abas adicionais: Ingredientes, Rendimento, Preços e custos, Histórico

---

### 3. Estoque
**Arquivo:** `estoque.html`

Controle completo de movimentação de estoque por loja. Usa o método de **Custo Médio Ponderado (CMPon)** para calcular o custo real de cada insumo por loja.

**Abas principais:**

#### Entradas
Registra toda entrada de mercadoria no estoque:
- Insumo, quantidade, custo unitário, fornecedor, data, nota fiscal
- Ao salvar, recalcula automaticamente o **custo médio** da loja
- Suporta importação de **XML de NF-e** para entrada automática via nota fiscal

#### Saídas
Registra consumo, perdas, transferências e ajustes:
- Tipos: venda, perda, transferência, consumo interno, ajuste
- Deduz do saldo da loja

#### Kardex
Histórico completo de movimentações de um insumo específico:
- Linha a linha com saldo acumulado
- Filtros por insumo, loja e período

#### Inventário
Contagem física do estoque:
- Registra o saldo real contado
- Gera ajuste automático comparando saldo contado × saldo do sistema

#### Fechamento
Apuração mensal do estoque:
- Estoque inicial + Entradas − Saídas = Estoque final teórico
- Compara com inventário físico
- Calcula CMV do período

#### Movimentação
Visão consolidada de todas as movimentações em um período.

#### Sugestão de Compras
Lista automática de insumos abaixo do estoque mínimo configurado, com sugestão de quantidade a comprar.

#### Saldo de Estoque *(relatório)*
Posição financeira atual do estoque por loja:
- Quantidade em estoque × custo médio = valor financeiro
- Filtros: loja e categoria
- Linha de total geral com valor total em R$

#### Histórico de Custos *(relatório)*
Auditoria de variações do custo médio ponderado:
- Registra cada mudança de custo médio ao dar entrada
- Mostra: saldo anterior, custo anterior, quantidade e custo da entrada, novo custo médio, impacto percentual
- Impacto em verde (redução) ou vermelho (aumento)
- Filtros: loja, insumo, origem e período

---

### 4. Porcionamento / Rendimento Operacional
**Arquivo:** `porcionamento.html`

Controla o processamento de insumos na cozinha. Registra o que entra para processamento, o que sai como produto e as perdas, permitindo calcular o rendimento real de cada processo.

**Modelos de processo:**

#### Simples (Peixe, Carne)
Para filetagem e porcionamento de pescados e carnes.

- **↓ Entrada:** recebimento da matéria-prima
  - Insumo, quantidade (kg), valor, responsável, observação
  - Gera registro no estoque secundário de processamento

- **↑ Saída:** filetagem/processamento
  - Peso de entrada (kg), custo/kg
  - Resultados: filé limpo (kg), pele (kg), aparas (kg)
  - Perdas calculadas automaticamente = entrada − aproveitável
  - Indicadores: Total aproveitável, Perdas, Rendimento operacional, Custo/kg filé, Custo/kg aproveitável

#### Degelo + Limpeza (Camarão, Polvo)
Para produtos que passam por descongelamento e limpeza.

- **↓ Entrada:** recebimento
  - Quantidade (kg), valor (opcional)

- **↑ Saída:** processamento
  - Peso congelado, peso descongelado, perda degelo (auto)
  - Peso limpo, perda limpeza (auto)
  - Rendimento, valor total

#### Cocção / Redução (Shimeji, Caldos)
Para produtos que perdem peso ao cozinhar.
- Peso inicial, peso final, redução (auto)
- Rendimento, custo

#### Produção em Lote (Shari, Molhos)
Para preparações em grande quantidade.
- Quantidade produzida (kg/un), quantidade de matéria-prima consumida
- Sobra, validade
- Rendimento, valor total de MP

**Abas:**

#### Lançamentos
Lista todas as movimentações com filtros por modelo, tipo (entrada/saída), loja, data e busca por produto.

#### Relatório Consolidado *(relatório)*
Análise de rendimento, perdas e custos por produto e período:
- Colunas adaptáveis por modelo selecionado
- Para modelo Simples: Peso Entrada, Pele (kg), Aparas (kg), Perdas (kg), Filé limpo (kg), Rendimento%, Custo/kg
- Para Degelo: Peso Congelado, Peso Descongelado, Perda Degelo, Peso Limpo, Perda Limpeza
- Linha de totais
- Exportação

#### Saldo Operacional *(relatório)*
Kardex do estoque secundário de processamento (modelos Simples e Degelo):
- Mostra entradas e saídas em ordem cronológica com saldo acumulado
- Para Salmão (Simples): colunas de unidades (peixes) + kg
- Para Camarão (Degelo): apenas colunas kg
- Tipo "Entrada" (azul) e "Saída" (vermelho)
- Saldo positivo em verde, negativo em vermelho
- Linha TOTAL GERAL
- Filtros: produto, loja, período
- Exportação CSV

---

### 5. Controle de Rendimento
**Arquivo:** `rendimento.html`

Testa e registra o rendimento real de cada insumo de forma isolada. Diferente do porcionamento (que é operacional), este módulo é para **testes e análises de rendimento**.

**O que registra:**
- Insumo, data do teste
- Peso bruto (kg), peso líquido (kg)
- Calcula: rendimento (%), perda (kg), perda (%), custo real/kg, custo total da perda

**Indicadores no topo:**
- Total de testes realizados
- Média de rendimento de todos os testes
- Menor rendimento (pior insumo)
- Custo total da perda no período
- Distribuição gráfica dos rendimentos (≤60%, 61-80%, 81-95%, >95%)

**Uso:** serve para calibrar o percentual de rendimento cadastrado nos insumos, baseando-se em medições reais.

---

### 6. PCP — Planejamento e Controle de Produção
**Arquivo:** `pcp.html`

Sugere automaticamente quanto produzir de cada item do cardápio com base no histórico de vendas e no dia da semana.

**Como funciona:**
- Analisa o padrão de consumo por dia da semana (Seg–Dom)
- Cruza com o estoque disponível
- Sugere quantidade a produzir por item
- Permite ajuste manual da sugestão

**Visualizações:**
- Grid de consumo por dia da semana
- Sugestão de produção para o dia atual
- Busca de sobra do dia anterior

---

### 7. Pedidos de Compra
**Arquivo:** `compras.html`

Gerencia pedidos de compra para fornecedores:
- Cria pedidos com itens, quantidades e valores
- Controla status (rascunho, enviado, recebido)
- Histórico de pedidos por fornecedor

---

### 8. Fornecedores
**Arquivo:** `fornecedores.html`

Cadastro de fornecedores com:
- Razão social, nome fantasia, CNPJ
- Contato (e-mail, telefone, WhatsApp)
- Endereço
- Categorias de produtos fornecidos
- Histórico de compras

---

### 9. Relatórios
**Arquivo:** `relatorios.html`

Central de relatórios gerenciais com visão consolidada de performance financeira:
- CMV por período
- Vendas × Custos
- Performance por categoria de produto
- Exportação para CSV/Excel

---

### 10. Portal do Gerente
**Arquivo:** `portal_gerente.html` / `loja.html`

Visão simplificada para gerentes de loja, com acesso às funcionalidades operacionais mais usadas:
- **PCP** completo (sugestão de produção)
- **Porcionamento** (registro de entradas e saídas de processamento, todos os modelos)

Acesso controlado por permissões — cada gerente vê apenas o que foi liberado pelo administrador.

---

### 11. Dashboard
**Arquivo:** `dashboard.html`

Visão executiva com indicadores principais do período:
- CMV geral
- Total de vendas e custos
- Fichas técnicas ativas
- Alertas de estoque crítico

---

### 12. Configurações
**Arquivo:** `configuracoes.html`

Administração do sistema:
- **Usuários:** cadastro de colaboradores com login e senha
- **Permissões:** controle de acesso por módulo e ação (visualizar, criar, editar, excluir)
- **Lojas:** cadastro das unidades do grupo
- **Categorias:** categorias de fichas técnicas e insumos
- **Parâmetros:** configurações gerais do tenant

---

## Como os custos funcionam

### Preço de compra (base)
Cadastrado no insumo. É o custo bruto por kg/unidade conforme nota fiscal.

### Custo real (ficha técnica padrão)
`Custo real = Preço de compra ÷ (Rendimento% ÷ 100)`

Considera a perda natural do insumo. Um insumo com 85% de rendimento custa efetivamente mais por quilo aproveitado.

### Custo médio ponderado por loja (CMPon)
Calculado automaticamente a cada entrada no estoque:

```
Custo médio novo = (Saldo anterior × Custo médio anterior + Quantidade entrada × Custo entrada) 
                   ÷ (Saldo anterior + Quantidade entrada)
```

**Este é o custo mais preciso** pois reflete a média ponderada de todas as compras realizadas para aquela loja. Quando você seleciona uma loja nas fichas técnicas, os custos são calculados usando este valor.

### Hierarquia de custo
1. **Custo médio da loja** (prioridade) — se existe saldo com custo médio calculado
2. **Preço de compra** (fallback) — se não há saldo ou custo médio zerado

---

## Fluxo operacional típico

```
1. Cadastrar insumos (ingredientes)
      ↓
2. Criar fichas técnicas (receitas) com ingredientes e preço de venda
      ↓
3. Dar entrada no estoque (manual ou via XML de NF-e)
   → Sistema calcula custo médio ponderado por loja
      ↓
4. Registrar processamento no Porcionamento
   → Entrada: recebimento da MP para processamento
   → Saída: resultado do processo (filé, produto limpo, etc.)
      ↓
5. Acompanhar relatórios
   → Saldo Operacional: quanto resta para processar
   → Relatório Consolidado: rendimento e perdas por produto
   → Saldo de Estoque: valor financeiro em estoque
   → Histórico de Custos: auditoria de variações de preço
```

---

## Glossário

| Termo | Significado |
|-------|-------------|
| CMV% | Custo da Mercadoria Vendida em percentual (custo ÷ venda × 100) |
| CMPon | Custo Médio Ponderado — método de valoração de estoque |
| Rendimento% | Percentual aproveitável de um insumo após perda natural |
| Markup | Quantas vezes o preço de venda é maior que o custo (venda ÷ custo) |
| Margem | Diferença entre preço de venda e custo (R$ ou %) |
| Ficha Técnica | Receita padronizada de um produto do cardápio |
| Insumo | Matéria-prima ou ingrediente |
| Saldo Operacional | Estoque secundário exclusivo para controle de processamento |
| NF-e | Nota Fiscal Eletrônica (XML importável no estoque) |
| Tenant | Grupo/empresa que opera o sistema (multilojas) |
