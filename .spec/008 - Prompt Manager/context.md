# Especificação Funcional: Painel de Gerenciamento de Prompts e Estrutura Curricular

## 1. Visão Geral e Objetivo

Para suportar a nova arquitetura de geração granular e paralela de material de estudo, é necessário um painel administrativo onde o usuário (Teacher) possa definir e editar as regras de geração (prompts) em diferentes níveis de granularidade. Este painel será a fonte da verdade para a "planta baixa" estrutural que alimenta o motor de requisições paralelas.

## 2. Estrutura e Hierarquia de Prompts

O sistema deve gerenciar os prompts seguindo uma arquitetura de herança e composição em quatro camadas:

1. **Prompt Principal (Global):** Regras universais, persona da IA, formato de saída genérico e diretrizes pedagógicas aplicáveis a qualquer material, independentemente do nível.
2. **Nível (Ex: A1, A2, B1, B2):** Contexto específico de proficiência, regras gramaticais e limites de vocabulário daquele nível.
3. **Módulo:** Agrupador lógico e sequencial de tópicos (ex: "Rotina Diária", "Viagens"). Pode conter diretrizes temáticas para manter a coesão dos tópicos filhos.
4. **Tópico (Granular):** A unidade mínima de geração. Contém a instrução específica do que a IA deve gerar para aquela requisição individual (ex: "Gere um diálogo em um restaurante pedindo o menu").

## 3. Requisitos de Interface (UI/UX)

### 3.1. Navegação e Layout Geral
* O painel deve ser dividido estruturalmente para separar configurações globais de configurações específicas de nível.
* Deve existir uma área dedicada (configuração geral) para a edição do **Prompt Principal**.
* Deve haver um seletor (abas ou menu lateral) para alternar a visualização e edição entre os diferentes **Níveis**.

### 3.2. Gerenciador de Árvore (Módulos e Tópicos)
Dentro da visualização de um Nível específico, a interface deve apresentar a estrutura curricular:

* **Visualização Hierárquica:** Módulos atuam como contêineres expansíveis (acordeões ou listas aninhadas) que agrupam seus respectivos Tópicos.
* **Ações de Módulo:** O usuário deve ser capaz de criar um novo módulo, editar seu título/contexto, alterar sua ordem na sequência e excluí-lo.
* **Ações de Tópico:** Dentro de um módulo, o usuário deve ser capaz de adicionar novos tópicos, editar o prompt específico do tópico, alterar a ordem e excluí-lo.

### 3.3. Formulários de Edição de Prompt
* Os campos de inserção de prompt devem ser áreas de texto redimensionáveis (*textareas* de grande capacidade), permitindo a leitura confortável de parágrafos longos.
* A interface deve indicar visualmente (através de *placeholders* ou tooltips) quais variáveis de interpolação estão disponíveis para uso (ex: `{{nome_aluno}}`, `{{objetivos}}`, `{{prognostico}}`).

## 4. Regras de Negócio e Comportamento

### 4.1. Composição do Prompt Final
O painel gerencia partes isoladas, mas o sistema deve garantir que, no momento da geração paralela, o prompt enviado à IA para o Tópico "X" seja a concatenação estruturada de:
`[Prompt Principal] + [Prompt do Nível] + [Contexto do Módulo] + [Prompt do Tópico] + [Dados do Aluno]`.

### 4.2. Integridade Estrutural e Exclusão Segura
* **Exclusão em Cascata:** Ao tentar excluir um Módulo que contém Tópicos, o sistema deve exigir uma confirmação explícita (alerta de segurança), informando que todos os tópicos filhos também serão deletados.
* **Ordenação (Reordenação):** A ordem de módulos e tópicos dita a sequência do material gerado. O painel deve permitir a reordenação (seja por botões de seta subir/descer ou *drag-and-drop*) e salvar automaticamente o índice de ordenação (`order`) atualizado.

### 4.3. Salvamento e Rascunho
* O sistema deve possuir um mecanismo de salvamento claro (botão "Salvar Alterações" por nível ou global) ou auto-save (salvamento automático ao perder o foco do campo).
* Modificações na estrutura curricular neste painel afetarão apenas as **próximas gerações** de material. Materiais já gerados para alunos não devem sofrer mutações retroativas.

## 5. Contrato de Integração (Alimentando a Geração Paralela)

Este painel é o responsável por construir e manter o "esqueleto" que o fluxo de geração paralela consumirá.

* **Exportação da Planta Baixa:** O backend, alimentado por este painel, deve fornecer um endpoint (ex: `GET /curriculum/levels/:id/blueprint`) que retorna a lista exata e ordenada de módulos e tópicos. 
* O fluxo de geração de material (descrito na especificação de Geração Granular) consumirá essa "planta baixa" para montar a tela de monitoramento e disparar as `N` requisições simultâneas, uma para cada tópico ativo configurado neste painel.