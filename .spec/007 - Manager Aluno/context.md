# Especificação Funcional: Refatoração da Tela de Gestão de Alunos

## 1. Visão Geral e Objetivo

A tela de listagem e gerenciamento de alunos precisa ser refatorada para melhorar a usabilidade, especialmente em dispositivos móveis (*mobile-first*). O objetivo principal é eliminar problemas de quebra de layout causados por botões mal posicionados, introduzir uma área de clique mais orgânica e implementar filtros de busca e status, garantindo que apenas usuários com perfil de aluno sejam exibidos.

## 2. Requisitos de Interface (UI/UX)

### 2.1. Área de Interação (Cards/Linhas Clicáveis)
* **Remoção de Botão Explícito:** O botão isolado de "Ver Detalhes" deve ser completamente removido da interface.
* **Componente de Navegação Orgânica:** Cada aluno na lista deve ser renderizado como um bloco (card ou linha de lista) onde o **nome e o e-mail** do aluno compõem a área principal de clique.
* **Feedback Visual:** Ao tocar/clicar ou passar o mouse (*hover*) sobre o bloco do aluno, o componente deve fornecer um feedback visual leve (ex: mudança sutil na cor de fundo ou leve sombra) indicando que o elemento inteiro é interativo.
* **Responsividade:** O agrupamento de nome e e-mail deve empilhar ou truncar graciosamente em telas pequenas, sem distorcer ou espremer a interface.

### 2.2. Barra de Pesquisa e Filtros
A tela deve apresentar uma área superior dedicada a controles de filtragem:
* **Busca por Nome:** Um campo de entrada de texto (*input text*) com ícone de lupa, permitindo a digitação do nome do aluno.
* **Filtro de Status:** Um controle (como *toggle*, abas ou *dropdown*) para alternar a visualização entre:
  * Todos os Alunos (opcional, dependendo da regra de negócio padrão)
  * Alunos Ativos
  * Alunos Inativos

## 3. Regras de Negócio e Comportamento

### 3.1. Exclusividade de Papel (Role Filtering)
* **Regra Crítica:** A listagem deve exibir **estritamente** usuários classificados como Alunos. 
* Usuários com a flag, *role* ou permissão de Professor (Teacher) ou Administrador devem ser filtrados e não podem aparecer nesta listagem sob nenhuma circunstância.

### 3.2. Comportamento da Pesquisa
* A filtragem por nome deve ser *case-insensitive* (ignorar maiúsculas/minúsculas).
* Se a busca for implementada em tempo real (no cliente ou no servidor), deve possuir um *debounce* (atraso de alguns milissegundos após a digitação) para evitar disparos excessivos de requisições ou travamentos de tela.

### 3.3. Comportamento do Filtro de Status
* O estado padrão ao abrir a página deve exibir os alunos "Ativos" (ou seguir a definição padrão do negócio).
* A alternância entre ativos e inativos deve atualizar a lista imediatamente, respeitando a palavra-chave que estiver no campo de "Busca por Nome", se houver.

## 4. Requisitos de Integração e Navegação

### 4.1. Navegação de Detalhes
* Ao clicar no bloco do aluno (nome/e-mail), o sistema deve acionar o roteamento para a página ou modal existente de "Detalhes do Aluno" (ou formulário de edição), passando o ID do aluno correspondente no estado da rota ou parâmetro.

### 4.2. Contrato de API (Backend)
Para suportar os requisitos acima com eficiência, a chamada para buscar a lista de usuários (`GET /users` ou endpoint equivalente) deve suportar os seguintes parâmetros de query:
* `?role=student` (Garantia de segurança no backend para nunca retornar teachers).
* `?search={termo}` (Para busca por nome delegada ao banco, se houver paginação).
* `?status=active|inactive` (Para o filtro de status).
*(Nota: Se a lista completa de alunos for pequena e carregada de uma vez no frontend, as filtragens de busca e status podem ocorrer em memória, mas a filtragem do papel de `Teacher` **deve** ser garantida no backend).*