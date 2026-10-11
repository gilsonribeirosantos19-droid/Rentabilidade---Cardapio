-- ============================================================================
-- CENTRAL DE AJUDA — conteúdo COMPLETO (manual do sistema)
-- Substitui os guias iniciais pela versão detalhada. Idempotente (apaga e recria).
-- Só documenta o que EXISTE no sistema. Edite/inclua à vontade depois.
-- ============================================================================
delete from public.ajuda_artigos;

insert into public.ajuda_artigos (modulo, ordem, titulo, conteudo) values

-- ===================== PRIMEIROS PASSOS =====================
('Primeiros passos', 1, 'O que é o Aiko e pra que serve',
 E'O Aiko é o sistema de gestão (ERP) do restaurante. Ele junta num lugar só:\n• Cadastros (insumos, produtos, fichas técnicas, fornecedores);\n• Estoque (entradas, saídas, inventário, saldo e custo médio);\n• Fiscal (recebimento das notas fiscais de compra);\n• Compras (sugestão, cotação e pedidos);\n• Gestão (CMV, rendimentos, DRE de compras, metas);\n• Vendas (faturamento e análises vindas do caixa).\n\nO objetivo é você saber quanto custa, quanto compra, quanto vende e quanto sobra — com números reais.'),

('Primeiros passos', 2, 'Como navegar no sistema',
 E'• O MENU fica na barra lateral esquerda, dividido por áreas (Estoque, Fiscal, Cadastros, Gestão...).\n• Ao abrir uma tela, ela vira uma ABA no topo — dá pra ter várias abertas e alternar.\n• O seletor "Todas as lojas" no topo filtra as telas por uma loja específica. Algumas telas (DRE, Fiscal) têm o próprio filtro de loja dentro delas.\n• O ícone ? abre a ajuda rápida; o sininho 🔔 mostra as novidades do sistema.'),

('Primeiros passos', 3, 'O fluxo do dia a dia (visão geral)',
 E'Um ciclo simples de como tudo se conecta:\n1. Você cadastra os INSUMOS (matéria-prima) com preço e rendimento.\n2. As NOTAS FISCAIS de compra chegam no Fiscal › Monitor NF-e; ao processar, viram ENTRADA no estoque e recalculam o custo médio.\n3. O ESTOQUE acompanha saldo e custo; as SAÍDAS/perdas são lançadas manualmente.\n4. No fim do mês, o INVENTÁRIO ajusta o saldo contado e fecha o CMV.\n5. A GESTÃO mostra CMV, rendimentos e o DRE de compras (quanto comprou por conta).'),

-- ===================== CADASTROS =====================
('Cadastros', 1, 'Como cadastrar um insumo',
 E'Insumo é a matéria-prima (salmão, arroz, embalagem...).\n1. Vá em Cadastros › Insumos › Novo.\n2. Preencha: nome, unidade de medida (kg, g, litro, ml, un), unidade de compra e o preço de compra (por kg/litro).\n3. Informe o rendimento (% de aproveitamento) — veja o guia específico.\n4. Marque "ativo".\nO custo das fichas é calculado a partir desse preço e do rendimento.'),

('Cadastros', 2, 'Rendimento (% de aproveitamento) do insumo',
 E'O rendimento diz quanto do que você compra realmente vira comida.\nExemplo: salmão com 85% de rendimento significa que de 1 kg comprado, 850 g são aproveitados (o resto é aparas, pele, etc.).\nO sistema usa isso pra achar o CUSTO REAL: custo = preço_compra ÷ (rendimento% ÷ 100).\nQuanto menor o rendimento, maior o custo real por grama aproveitada.'),

('Cadastros', 3, 'Embalagens de compra do insumo',
 E'Serve pra comprar na embalagem que o fornecedor vende (caixa, fardo, pacote), sem ter que converter na mão.\n1. No cadastro do insumo, aba Embalagem, informe a embalagem e quantas unidades vêm nela.\n2. Nos pedidos de compra, você pede na embalagem e o sistema espelha a quantidade.\nA quantidade por embalagem também é usada no recebimento da NF-e (quantos itens vêm na caixa).'),

('Cadastros', 4, 'Conta (DRE) do insumo',
 E'É a classificação gerencial do insumo — em qual conta do DRE a compra dele entra.\n1. Vá em Cadastros › Insumos.\n2. Na coluna "Conta (DRE)", clique no chip do insumo e escolha a conta (ex.: Salmão, Embalagens, Material de Limpeza).\n3. A partir daí, TODA compra futura desse insumo já entra nessa conta, automaticamente.\nDica: o botão "✨ Auto classificar" tenta casar os insumos com as contas pela semelhança do nome.'),

('Cadastros', 5, 'Ficha de processado (shari, molhos, etc.)',
 E'Processado é um item que você produz a partir de outros (ex.: shari = arroz + tempero).\n1. Crie a ficha técnica do processado com os ingredientes.\n2. Vincule a ficha a um INSUMO (o processado precisa existir como insumo).\n3. Informe o rendimento da receita em gramas (quanto a receita rende pronta).\nAo salvar, o sistema calcula o custo/kg do processado e atualiza o preço do insumo vinculado. Sem o vínculo + rendimento, o custo vem R$ 0.'),

('Cadastros', 6, 'Como montar uma ficha técnica',
 E'A ficha técnica é a receita do prato com custo.\n1. Vá em Cadastros › Fichas Técnicas › Nova.\n2. Dê nome, categoria e o rendimento em porções.\n3. Adicione os ingredientes (insumos) com a quantidade em GRAMAS.\n4. Informe o preço de venda.\nO sistema calcula sozinho: custo, CMV %, markup e margem. Semáforo do CMV: verde ≤30%, amarelo ≤38%, vermelho acima.'),

('Cadastros', 7, 'Como cadastrar um fornecedor',
 E'1. Vá em Cadastros › Fornecedores › Novo.\n2. Preencha nome, CNPJ e código (se tiver).\nO CNPJ é importante: é por ele que a nota fiscal recebida casa automaticamente com o fornecedor certo (e os vínculos de item valem pras próximas notas dele).'),

-- ===================== ESTOQUE =====================
('Estoque', 1, 'Entrada manual de estoque',
 E'Use quando a entrada não veio por nota fiscal (ex.: ajuste, produção interna).\n1. Vá em Estoque › Entradas.\n2. Escolha o insumo, a loja, a quantidade e o custo.\n3. Salve. O saldo sobe e o custo médio é recalculado.\nObs.: a maioria das entradas vem automática pelo Fiscal (ao processar a NF-e). A entrada manual é pra exceções.'),

('Estoque', 2, 'Saídas e perdas',
 E'A baixa de estoque no Aiko é MANUAL (não baixa sozinho por venda).\n1. Vá em Estoque › Saídas.\n2. Escolha insumo, loja e quantidade.\n3. No tipo, use: consumo, perda, vencimento ou descarte.\nPerdas, vencimentos e descartes entram no cálculo do CMV do período — por isso é importante lançar.'),

('Estoque', 3, 'Como fazer o inventário',
 E'O inventário acerta o saldo pelo que você realmente contou.\n1. Vá em Estoque › Inventário.\n2. Lance a quantidade CONTADA de cada insumo.\n3. Ao FECHAR, o sistema ajusta o saldo para a contagem (mantém o custo médio, mexe só na quantidade).\nImportante: o inventário fecha o período para o CMV. Conte TUDO que está no estoque, inclusive o que ainda não entrou formalmente — senão vira ajuste no fechamento.'),

('Estoque', 4, 'Saldo de estoque',
 E'Em Estoque › Saldo de Estoque você vê a posição atual: quanto tem de cada insumo (quantidade e valor) por loja.\nO valor usa o custo médio atual. É a sua "foto" do estoque hoje.'),

('Estoque', 5, 'Movimentação no período',
 E'Em Estoque › Movimentação você vê, por insumo, o que entrou e saiu num período: quantidade anterior, entradas, ajustes/transferências, consumo, perdas e saldo final.\nDica: se a "Q.Final" aparecer muito negativa, geralmente é porque o período escolhido ATRAVESSA um inventário. Olhe o período DEPOIS do fechamento do inventário.'),

('Estoque', 6, 'Kardex (extrato por insumo)',
 E'O Kardex (Estoque › Kardex) é o extrato detalhado de UM insumo: cada entrada e saída em ordem de data, com saldo e custo após cada movimento. Use pra investigar "por que o saldo/custo desse item está assim".'),

('Estoque', 7, 'Ajustes de estoque e de custo médio',
 E'• Estoque › Ajuste de Estoque: corrige a QUANTIDADE de um insumo numa loja (com motivo).\n• Estoque › Ajuste de Custo Médio: corrige o CUSTO médio de um insumo.\n• Estoque › Recalcular: recalcula o custo médio refazendo a conta a partir das entradas.\nUse com cuidado — são correções, não o dia a dia. O custo médio também é recalculado automaticamente toda madrugada.'),

-- ===================== FISCAL =====================
('Fiscal', 1, 'Monitor de NF-e — visão geral',
 E'É onde as notas fiscais de compra chegam (Fiscal › Monitor NF-e).\nAs situações aparecem por cor:\n• Pendente SEFAZ — ainda chegando;\n• Para processar — pronta pra lançar no estoque;\n• Com Erro — algum item sem vínculo (ponto vermelho);\n• Processada — já entrou no estoque.\nAbas: DANFE (lista das notas), Itens (itens da nota), Apropriação (conta do DRE), Erros.'),

('Fiscal', 2, 'Como processar uma nota (dar entrada)',
 E'1. Fiscal › Monitor NF-e.\n2. Confira a nota em "Para processar". Se tiver ponto vermelho, corrija o vínculo primeiro (veja o guia de erro).\n3. Selecione a(s) nota(s) e clique em "Processar selecionadas".\n4. Cada item vira ENTRADA no estoque (na unidade de compra × embalagem) e o custo médio é recalculado.\nO sistema evita duplicar: se a nota já estiver no estoque, ele apenas marca como processada.'),

('Fiscal', 3, 'O que fazer quando a NF-e dá erro (vínculo)',
 E'Ponto vermelho = um item da nota não está ligado a nenhum insumo seu.\n1. Clique no ponto vermelho (ou abra a aba Erros).\n2. Clique em "Corrigir" no item.\n3. Escolha o insumo interno e a embalagem (quantas unidades vêm na caixa).\n4. Salve. O vínculo passa a valer para as PRÓXIMAS notas do mesmo fornecedor + código, automaticamente.'),

('Fiscal', 4, 'Apropriação — conta do DRE por item',
 E'Na aba Apropriação (dentro da nota) você vê em qual conta do DRE cada item vai cair.\n• Cada item já vem na conta do seu insumo (automático).\n• Pra trocar só NESTA nota (ex.: carne que foi pra alimentação de funcionário): mude a conta do item — fica marcado "nesta nota".\n• Se for virar o padrão desse insumo pra sempre, clique em "tornar padrão" (grava no cadastro do insumo).'),

('Fiscal', 5, 'Imprimir e visualizar a DANFE',
 E'Com uma nota selecionada, na aba Itens aparecem os botões:\n• "Imprimir DANFE" — gera o PDF da nota.\n• "Visualizar DANFE" — abre a nota pra conferência.\nÚtil pra conferir a mercadoria contra o documento fiscal.'),

-- ===================== COMPRAS =====================
('Compras', 1, 'Sugestão de compras',
 E'Em Compras › Sugestão de Compras o sistema indica o que comprar com base no consumo e no estoque. Você revisa as quantidades e gera o pedido a partir dali.'),

('Compras', 2, 'Cotação de compras',
 E'Em Compras › Cotação de Compras você compara fornecedores para os itens a comprar e escolhe o melhor preço. A partir da cotação é possível gerar o pedido firme.'),

('Compras', 3, 'Pedido de compra',
 E'Em Compras › Pedidos de Compra você monta/visualiza o pedido ao fornecedor. Se o insumo tem embalagem cadastrada, o pedido sai na embalagem (ex.: 5 caixas), facilitando pro fornecedor.'),

-- ===================== GESTÃO / DRE =====================
('Gestão', 1, 'DRE de Compras — o que é',
 E'É a controladoria de COMPRAS (Gestão › DRE de Compras). Mostra quanto você comprou dentro de cada conta gerencial, mês a mês. Não é tesouraria (não tem contas a pagar) — o foco é controlar as compras por categoria.\nTem 4 telas: Demonstrativo, Orçamento, Plano de contas e Lançamentos.'),

('Gestão', 2, 'DRE — Demonstrativo',
 E'O Demonstrativo (Gestão › DRE de Compras › Demonstrativo) mostra a receita no topo e, abaixo, as compras somadas por conta (Salmão, Embalagens, Gás...), mês a mês, até dar o Resultado.\n• Clique numa conta para abrir os insumos dela.\n• O botão R$/% alterna entre valor e % sobre a receita.\n• Filtros de loja e ano; exporta pra Excel.'),

('Gestão', 3, 'DRE — Orçamento (teto, ritmo e consolidado)',
 E'Em Gestão › DRE de Compras › Orçamento você define um TETO mensal por conta e acompanha o realizado.\n1. Escolha a LOJA (o teto é por loja) e digite o teto de cada conta (salva ao sair do campo).\n2. "Todas as lojas" mostra o consolidado (soma dos tetos das lojas).\n3. O período (Mês atual/anterior/personalizado) define a janela do realizado.\nO "ritmo" compara o que você já comprou com o ESPERADO proporcional aos dias do período — assim dá pra fechar o controle a cada 7 dias sem esperar o mês acabar.'),

('Gestão', 4, 'DRE — Plano de contas',
 E'Em Gestão › DRE de Compras › Plano de contas você cria, renomeia e inativa as contas gerenciais (ex.: criar a conta "Material de TI"). É a estrutura que o Demonstrativo e o Orçamento usam.'),

('Gestão', 5, 'DRE — Lançamentos manuais',
 E'Para compras SEM nota fiscal (feira, compra no débito), use Gestão › DRE de Compras › Lançamentos.\nInforme data, conta, valor e loja. Esses lançamentos entram no Demonstrativo somados à conta escolhida.'),

('Gestão', 6, 'CMV Teórico × Real',
 E'Em Gestão › CMV Teórico × Real você compara o CMV que DEVERIA ter (teórico, pelas fichas e vendas) com o CMV REAL (pelo estoque). A diferença aponta perdas, desperdício, porção fora do padrão ou erro de apontamento.'),

('Gestão', 7, 'Rendimentos',
 E'Em Gestão › Rendimentos você acompanha o aproveitamento real dos insumos (ex.: quanto de salmão limpo saiu de cada quilo comprado). Ajuda a achar o número de rendimento certo para usar nos cadastros e no custo.'),

('Gestão', 8, 'Divergências',
 E'Em Gestão › Divergências o sistema aponta inconsistências (ex.: item sem custo, vínculo estranho) pra você corrigir. É uma tela de "saúde dos dados".'),

('Gestão', 9, 'Fechamento de Custo Mensal e como o CMV é calculado',
 E'O CMV do período é: Estoque Inicial + Compras + Entradas de Transferência − Saídas de Transferência − Estoque Final (incluindo perdas).\nO Fechamento (Gestão › Fechamento de Custo) trava o mês depois de conferido, guardando o CMV daquele período. Meses fechados mantêm o número histórico.'),

('Gestão', 10, 'Metas',
 E'Em Gestão › Metas você acompanha Meta × Realizado por loja, dia a dia. O sistema envia alerta no WhatsApp e um PDF diário. O ticket médio é calculado como faturamento ÷ número de comandas.'),

-- ===================== PDV / VENDAS =====================
('PDV', 1, 'Recebimento de vendas',
 E'Em PDV › Recebimento de Vendas entram os dados de venda vindos do caixa (iComanda/Saipos). Só o que está "processado" alimenta os relatórios e o CMV. É a porta de entrada das vendas no sistema.'),

('PDV', 2, 'Faturamento',
 E'Em PDV › Faturamento você vê o faturamento das vendas por período e loja — o total vendido, base para análises e para o ticket médio.'),

('PDV', 3, 'Vendas por dia (canal e turno)',
 E'Em PDV › Vendas por Dia as vendas vêm separadas por CANAL (salão, delivery) e TURNO, exatamente como no caixa. Útil pra entender onde e quando você vende mais.'),

('PDV', 4, 'Curva ABC de vendas',
 E'Em PDV › Curva ABC os produtos são ordenados pelo quanto representam das vendas: A = os que mais pesam no faturamento, C = os que menos pesam. Ajuda a priorizar o que importa.'),

('PDV', 5, 'Engenharia de cardápio',
 E'Em PDV › Engenharia de Cardápio os produtos são cruzados por popularidade (quanto vende) e margem (quanto lucra), formando quatro grupos (estrela, vaca, interrogação, abacaxi). Ajuda a decidir o que destacar, ajustar preço ou tirar do cardápio.'),

-- ===================== CONFIGURAÇÕES / ACESSO =====================
('Configurações', 1, 'Permissões por grupo',
 E'Em Configurações › Permissões você controla o que cada GRUPO de acesso pode ver e fazer. Monte os grupos (ex.: Gerente, Operador) e marque as telas/ações liberadas. Quem não tem acesso simplesmente não vê aquela parte do menu.'),

('Configurações', 2, 'Usuários',
 E'Em Configurações › Usuários você cria e edita os usuários do sistema, define o perfil/grupo e a loja. Cada pessoa entra com o próprio login.'),

('Configurações', 3, 'Trocar de loja',
 E'No topo do sistema há o seletor "Todas as lojas". Troque ali para filtrar as telas por uma loja específica. Algumas telas (DRE, Fiscal) têm o próprio filtro de loja dentro delas.'),

-- ===================== CONCEITOS =====================
('Conceitos', 1, 'O que é CMV',
 E'CMV = Custo da Mercadoria Vendida: quanto de insumo "virou venda" no período. Em %, é o quanto da sua receita foi gasto com matéria-prima.\nO Aiko calcula o CMV pelo estoque: Estoque Inicial + Compras − Estoque Final (com transferências e perdas). Controlar o CMV é controlar a maior parte do custo do restaurante.'),

('Conceitos', 2, 'Custo médio',
 E'Custo médio é o preço médio que você está pagando por um insumo, considerando todas as entradas. A cada compra, o sistema recalcula: mistura o que já tinha em estoque com o que entrou.\nÉ esse custo que valoriza o estoque e alimenta as fichas e o CMV.'),

('Conceitos', 3, 'Rendimento / aproveitamento',
 E'Rendimento é o quanto de um insumo realmente vira comida (o resto é perda natural: aparas, pele, degelo).\nUm salmão com 85% de rendimento rende 850 g aproveitados por kg comprado. Quanto menor o rendimento, maior o custo real do que sobra pra usar — por isso ele entra no cálculo do custo.'),

('Conceitos', 4, 'Conta efetiva (DRE)',
 E'No DRE, a "conta efetiva" de uma compra é: o override da nota (se você trocou na Apropriação) OU, se não trocou, a conta do cadastro do insumo.\nResumo: o cadastro do insumo é o padrão; o override vale só naquela nota. É isso que decide em qual conta a compra aparece no Demonstrativo.');
