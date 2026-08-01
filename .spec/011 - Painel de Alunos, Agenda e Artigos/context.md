# Spec 011 (Backend) — Painel de Alunos, Agenda, Artigos e Refinamentos

> **Objetivo:** Preparar as APIs e o banco de dados (Firestore) para suportar as novas regras da Agenda de 30min, novo módulo de Artigos, novas permissões (Guards) de Alunos e suporte a Perfis com upload de imagens.

## 1. Requisitos Funcionais (Backend)

- **Gestão de Alunos (Guards):** Somente `MANAGER` pode criar alunos. Professora lê apenas os alunos que têm seu `teacherId`.
- **Agenda e Slots:** Suporte a agendamentos em horários "quebrados" (ex: 08:30). Uma aula padrão de 1 hora deve bloquear e ocupar 2 slots de 30 minutos na base de dados.
- **Painel de Vídeos:** Remoção de eventuais endpoints/tabelas ligados ao antigo painel de vídeos.
- **Módulo de Artigos:** Criar CRUD (`Article` com `title`, `content`, `coverImageUrl`, `authorId`). Escrita restrita à Manager, leitura para alunos e professoras.
- **Faturamento da Professora:** Endpoint para calcular o faturamento semanal/mensal da professora logada, baseado em seus alunos ativos.
- **Perfis e Imagens:** Entidade `User` (e DTOs) deve receber os campos `profileImageUrl` e, no caso de professoras, `bio`.

## 2. Decisões Técnicas

- **Imagens:** O frontend será responsável por comprimir a imagem e fazer upload direto para o Firebase Storage. O Backend armazenará nos documentos (ex: `profileImageUrl` ou `coverImageUrl`) apenas a URL gerada pelo bucket.
- **Slots da Agenda:** Refatorar a geração e validação de `AgendaSlot` para operar nativamente com a granularidade de 30 minutos.
