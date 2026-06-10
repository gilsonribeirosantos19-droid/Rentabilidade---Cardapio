# 📚 Glossário do Projeto — Explicado pra Leigo

> Um "dicionário" dos termos técnicos que aparecem no projeto, com **analogias** e **exemplos do seu próprio sistema (Aiko)**.
> Leia como quiser — pode pular direto pro termo que te interessa.

---

## 🌐 1. Como um site funciona (o básico)

### Frontend ("a frente")
**Analogia:** o **salão do restaurante** — o que o cliente vê e usa (mesas, cardápio, decoração).
É tudo que aparece na **tela**: botões, telas, cores, formulários. No seu projeto, são os arquivos `.html`, `.css` e `.js`.

### Backend ("os fundos")
**Analogia:** a **cozinha + estoque** — o cliente não vê, mas é onde a comida é feita e guardada.
É onde os **dados ficam guardados** e as **regras** rodam. No seu caso, o backend é o **Supabase**.

### HTML / CSS / JavaScript
As 3 "linguagens" do frontend:
- **HTML** = o **esqueleto** (onde fica cada coisa: título, tabela, botão).
- **CSS** = a **roupa/maquiagem** (cor, tamanho, fonte, espaçamento).
- **JavaScript (JS)** = o **cérebro** (o que acontece quando você clica, salva, calcula).

**Exemplo seu:** quando você abre `insumos.html`, o HTML monta a tabela, o `design-system.css` pinta ela, e o JavaScript busca os insumos no banco.

---

## 🎨 2. Coisas que você VÊ na tela (interface)

### Sidebar (barra lateral)
**O quê:** o **menu vertical** do lado esquerdo (Dashboard, Estoque, Fiscal, etc.).
**Analogia:** o **índice** de um livro — te leva pra cada parte do sistema. No seu projeto, vem do `sidebar.js`.

### Modal (janela pop-up)
**O quê:** aquela **janelinha que abre por cima** da tela (geralmente escurecendo o fundo), pra você preencher ou ver algo sem sair da página.
**Analogia:** um **post-it gigante** que cola na frente da tela. Você resolve e ele fecha.
**Exemplo seu:** ao clicar em "Nova Ficha", abre um **modal** com o formulário.

### Hub
**O quê:** uma tela "**central**" com **cards** (cartões) que levam pra sub-telas.
**Analogia:** a **tela inicial de um caixa eletrônico** (Saque, Saldo, Transferência).
**Exemplo seu:** o **PCP** e o **Estoque** abrem um hub com cards.

### Aba (tab)
**O quê:** as **abas** dentro de uma tela (tipo as abas do navegador), pra alternar conteúdo sem recarregar.
**Exemplo seu:** no Fiscal, as abas **DANFE / Itens / Erros**.

### Dropdown / Select / Seletor
**O quê:** a **lista suspensa** que abre quando você clica (ex: escolher um Grupo).
**Analogia:** o **menu de opções** de um caixa de seleção. O "seletor com busca" é um dropdown que **filtra** conforme você digita.

### Toast
**O quê:** aquela **mensagenzinha** que aparece e some sozinha (ex: "Usuário atualizado" no canto).
**Analogia:** uma **torrada que pula da torradeira** 🍞 — aparece rapidinho pra avisar e some.

### Placeholder
**O quê:** o **texto cinza de exemplo** dentro de um campo vazio (ex: "Informe a qtd").
**Analogia:** a **plaquinha "escreva aqui"** que some quando você começa a digitar.

---

## 🗂️ 3. Git e Publicação (versão + deploy)

### Git
**O quê:** um sistema que **guarda o histórico** de TODAS as mudanças no código.
**Analogia:** o **"desfazer" infinito** (Ctrl+Z) + um **álbum de fotos** de cada versão do projeto. Dá pra voltar a qualquer ponto.

### Commit
**O quê:** **salvar um ponto** no histórico, com uma descrição do que mudou.
**Analogia:** **tirar uma foto** do projeto naquele momento e escrever uma legenda ("arrumei o bug do filtro").
**Exemplo seu:** cada vez que terminamos algo, eu faço um **commit**.

### Push / Pull
- **Push** = **enviar** seus commits pro GitHub (a nuvem). "Empurrar pra cima".
- **Pull** = **trazer** as mudanças da nuvem pro seu computador. "Puxar pra baixo".

### Repositório (repo)
**O quê:** a **pasta do projeto** inteira, com todo o histórico, guardada no GitHub.
**Analogia:** o **arquivo-morto** oficial do projeto.

### GitHub
**O quê:** o **site/nuvem** onde o repositório fica guardado e compartilhado.
**Analogia:** o **Google Drive do código** (mas especializado em programação).
- **Público** = qualquer um vê. **Privado** = só quem você autorizar.

### Branch (ramificação)
**O quê:** uma **linha paralela** de desenvolvimento.
**Analogia:** um **rascunho separado** pra testar mudanças sem mexer no "oficial".
**Exemplo seu:** a `preview-erp` é o **rascunho de testes**; a `main` é a **versão oficial** (que vai pro ar). Só passo da preview pra main quando você aprova.

### Merge
**O quê:** **juntar** uma branch na outra (levar o rascunho aprovado pro oficial).
**Analogia:** **passar a limpo** o rascunho pro caderno oficial.

### Deploy
**O quê:** **publicar** o site pra ficar no ar (acessível na internet).
**Analogia:** **abrir as portas do restaurante** pro público.
**Exemplo seu:** quando dou `push` na `main`, a **Vercel** faz o **deploy** automático.

### Vercel
**O quê:** o **serviço que hospeda** seu site e o publica automático.
**Analogia:** o **"prédio" onde seu site mora** e fica disponível 24h.

### Revert / Rollback
**O quê:** **desfazer** uma mudança, voltando pra versão anterior.
**Analogia:** o **Ctrl+Z** do projeto publicado.

---

## 🗄️ 4. Banco de Dados (Supabase)

### Banco de dados
**O quê:** onde **todos os dados ficam guardados** de forma organizada.
**Analogia:** um **arquivo de planilhas gigante e inteligente**.

### Supabase
**O quê:** o **serviço de backend** que você usa — banco de dados + login + API, tudo junto.
**Analogia:** o **"escritório nos fundos"** que guarda tudo e atende os pedidos do site.

### Tabela / Coluna / Registro (linha)
**Analogia:** uma **planilha do Excel**.
- **Tabela** = a planilha inteira (ex: `insumos`).
- **Coluna** = o tipo de informação (ex: `nome`, `preco_compra`).
- **Registro/Linha** = um item específico (ex: o insumo "Salmão").

### Query (consulta)
**O quê:** um **pedido ao banco** ("me traz todos os insumos ativos").
**Analogia:** uma **pergunta** que o site faz pro banco e recebe a resposta.

### API
**O quê:** o **"garçom"** entre o site e o banco — leva o pedido e traz a resposta.
**Analogia:** o **balcão de atendimento**: o site pede ("quero os insumos"), a API entrega.
**Exemplo seu:** a função `api()` (no `utils.js`) faz exatamente isso.

### Endpoint
**O quê:** o **"endereço"** específico de um pedido na API.
**Analogia:** o **guichê certo** no balcão ("guichê de insumos", "guichê de fichas").

### CRUD
As 4 ações básicas com dados (sigla em inglês):
- **C**reate (criar), **R**ead (ler), **U**pdate (editar), **D**elete (apagar).
**Exemplo seu:** a tela de Insumos faz **CRUD** completo (cadastra, lista, edita, exclui).

### Migration
**O quê:** um **script** que muda a **estrutura** do banco (cria tabela, adiciona coluna).
**Analogia:** uma **reforma** no arquivo (adicionar uma gaveta nova).

---

## 🔐 5. Segurança e Acesso

### Autenticação x Autorização
- **Autenticação** = provar **quem você é** (login com email/senha).
  **Analogia:** mostrar o **RG na portaria**.
- **Autorização** = o que você **pode fazer** depois de entrar.
  **Analogia:** o **crachá** que abre só certas portas (admin abre tudo, gerente só algumas).

### Login / Sessão
- **Login** = entrar no sistema (provar quem é).
- **Sessão** = o período em que você fica logado.
  **Analogia:** a **pulseira** que você ganha na entrada e vale pelo tempo que ficar.

### Token / JWT
**O quê:** o **"comprovante" digital** de que você está logado, enviado a cada pedido.
**Analogia:** a **pulseira da festa** — o sistema confere ela toda vez, em vez de pedir seu RG de novo.
**JWT** é o formato técnico desse token (um texto criptografado).
**Exemplo seu:** o `sb_token` guardado no navegador é o seu JWT.

### Chave (API key)
**O quê:** uma **senha do sistema** (não sua, mas do app) pra conversar com o Supabase.
**Analogia:** a **chave do estabelecimento**. Existem tipos diferentes:
- **publishable / anon** = chave **pública** (pode ficar no site) — só faz o permitido pelo RLS.
- **secret / service_role** = chave **mestra** (abre TUDO, ignora regras) — **NUNCA** pode ficar no site, só no servidor.
**Exemplo seu:** hoje trocamos a chave mestra exposta e revogamos a antiga (que tinha vazado).

### apikey
**O quê:** o **campo** onde a chave acima é enviada em cada pedido.
**Analogia:** o **lugar onde você encosta o crachá** na catraca.

### RLS (Row Level Security) — "Segurança em nível de linha"
**O quê:** uma **trava no banco** que faz cada usuário enxergar **só as linhas que são dele** (do seu restaurante/tenant).
**Analogia:** um **cofre com divisórias**: mesmo que duas pessoas abram o mesmo cofre, cada uma só alcança a **própria gaveta**.
**Exemplo seu:** ligamos o RLS em todas as tabelas — agora o tenant Mori só vê os dados do Mori.

### Tenant / Multi-tenant
**O quê:** **tenant** = um "inquilino" (um restaurante/cliente). **Multi-tenant** = vários no mesmo sistema, **isolados**.
**Analogia:** um **prédio de apartamentos**: mesma estrutura, mas cada família (tenant) só entra no seu apê.
**Exemplo seu:** o sistema é multi-tenant; hoje opera o Mori.

### Edge Function
**O quê:** um **pedacinho de código que roda no servidor** (não no navegador), pra tarefas que exigem a chave mestra com segurança.
**Analogia:** um **funcionário dos fundos** que faz a tarefa perigosa longe dos olhos do cliente.
**Exemplo seu:** a `admin-users` cria usuários, e a `nfe-webhook` recebe as notas fiscais.

### Variável de ambiente (env / secret)
**O quê:** uma **configuração secreta guardada no servidor** (não no código), tipo uma chave.
**Analogia:** o **cofre do gerente** — fica separado, não escrito na parede.
**Exemplo seu:** a `APP_SERVICE_KEY` no Supabase é uma env.

---

## 💻 6. Código e Arquitetura

### Função
**O quê:** um **bloco de código que faz uma tarefa** e pode ser reusado.
**Analogia:** uma **receita**: você "chama" ela quando precisa, em vez de reescrever os passos.
**Exemplo seu:** `brl()` formata um número como "R$ 12,50".

### Variável
**O quê:** uma **"caixinha" com um valor** guardado e com um nome.
**Analogia:** um **pote etiquetado** ("preço = 12,50").

### Duplicação x Centralizar
- **Duplicação** = o **mesmo código copiado** em vários lugares (ruim: se tem um erro, tem que corrigir em todos).
  **Analogia:** ter a **mesma receita anotada em 20 cadernos** — mudou um ingrediente, tem que riscar em todos.
- **Centralizar** = deixar **num lugar só** e todos usarem de lá.
  **Analogia:** **um caderno de receitas único** que toda a cozinha consulta.
**Exemplo seu:** foi o que fizemos com a chave e o `api()` — de ~24 lugares pra 1.

### Refatoração
**O quê:** **reorganizar/limpar** o código **sem mudar o que ele faz** (só deixar melhor por dentro).
**Analogia:** **arrumar o armário** — as roupas são as mesmas, mas agora você acha tudo rápido.

### Cache
**O quê:** uma **cópia guardada temporariamente** pra carregar mais rápido (sem buscar tudo de novo).
**Analogia:** deixar o **que você mais usa em cima da bancada**, em vez de ir no estoque toda vez.
**Cuidado:** às vezes o cache fica **velho** e mostra algo desatualizado (por isso o "abrir em aba anônima" pra testar).

### Fallback
**O quê:** um **"plano B"** automático se o principal falhar.
**Analogia:** o **gerador de energia** que liga se faltar luz.
**Exemplo seu:** as Edge Functions usam `APP_SERVICE_KEY` **ou** (fallback) a chave antiga.

### Array / Loop
- **Array** = uma **lista** de itens.
  **Analogia:** uma **fila** ou lista de compras.
- **Loop** = **repetir** uma ação pra cada item da lista.
  **Analogia:** **carimbar cada folha** de uma pilha, uma por uma.

---

## 📊 7. Termos do SEU negócio (no sistema)

### CMV (Custo da Mercadoria Vendida)
**O quê:** **quanto custou** o que você vendeu (em ingredientes).
**Exemplo:** vendeu um temaki por R$ 30 e os ingredientes custaram R$ 9 → CMV = 30%.
**Semáforo seu:** 🟢 até 30%, 🟡 até 38%, 🔴 acima.

### Ficha técnica
**O quê:** a **"receita oficial"** de um prato, com cada ingrediente e quantidade, pra calcular o custo.
**Exemplo seu:** a ficha do Shari lista arroz, vinagre, etc., e calcula o custo por porção.

### Insumo
**O quê:** a **matéria-prima** (ingrediente comprado).
**Exemplo:** salmão, arroz, shoyu.

### Markup / Margem
- **Markup** = quantas vezes você **multiplica o custo** pra chegar no preço.
- **Margem** = quanto **sobra** (em %) depois dos custos.

### Kardex
**O quê:** o **histórico de entradas e saídas** de um item no estoque.
**Analogia:** o **extrato bancário** do estoque (cada movimento registrado).

### Custo médio
**O quê:** o **preço médio** de um item considerando as várias compras (com preços diferentes).
**Analogia:** se você comprou salmão a R$ 40 e depois a R$ 50, o custo médio fica no meio.

### NF-e / DANFE
- **NF-e** = **Nota Fiscal eletrônica** (a nota de compra do fornecedor).
- **DANFE** = o **"papel/resumo"** impresso/visual da NF-e.
**Exemplo seu:** o **Monitor de NF-e** recebe as notas e você vincula os itens aos seus insumos.

---

## 🎓 Dica final
Não precisa decorar tudo! Use este arquivo como **consulta**: quando eu (ou alguém) usar um termo que você não lembra, é só procurar aqui (Ctrl+F). Com o tempo, vira natural. 💪
