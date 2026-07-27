# 📚 Bárbara Farias API

API RESTful para a plataforma educacional **Bárbara Farias**, construída com **NestJS** e **Firebase (Firestore)**. A API gerencia usuários (alunos e professores), materiais didáticos gerados por IA (Gemini), módulos de vídeo e autenticação baseada em JWT.

---

## 🛠 Stack Tecnológica

| Tecnologia | Finalidade |
|---|---|
| **NestJS 11** | Framework backend |
| **Firebase Admin SDK** | Firestore (banco de dados) e autenticação |
| **Google Gemini AI** | Geração de conteúdo didático personalizado |
| **JWT (JSON Web Tokens)** | Autenticação e autorização |
| **Bcrypt** | Hash de senhas |
| **Zod** | Validação de schemas (resposta da IA) |
| **class-validator / class-transformer** | Validação de DTOs e transformação de dados |
| **Vercel** | Deploy em produção |

---

## 🚀 Instalação e Execução

### Pré-requisitos

- Node.js 18+
- Firebase Project configurado
- Chave de API do Google Gemini

### Setup Local

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
# Crie um arquivo .env na raiz com as variáveis necessárias (veja seção abaixo)

# Executar em modo de desenvolvimento
npm run start:dev

# Build de produção
npm run build

# Executar produção
npm run start:prod
```

### Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor (padrão: `8080`) |
| `JWT_SECRET` | Chave secreta para assinatura dos tokens JWT |
| `GEMINI_API_KEY` | Chave de API do Google Gemini |
| `GEMINI_MODEL` | Modelo do Gemini (padrão: `gemini-2.5-pro`) |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Service Account do Firebase em Base64 (produção/Vercel) |
| `FIREBASE_PROJECT_ID` | ID do projeto Firebase |
| `FIREBASE_AUTH_EMULATOR_HOST` | Host do emulador de auth (desenvolvimento) |
| `FIRESTORE_EMULATOR_HOST` | Host do emulador do Firestore (desenvolvimento) |

> Para ambiente local, o arquivo `serviceAccountKey.json` na raiz do projeto será utilizado automaticamente.

---

## 🏗 Arquitetura

```
src/
├── auth/                  # Módulo de autenticação
│   ├── auth.controller.ts     # Endpoint de login
│   ├── auth.service.ts        # Lógica de autenticação (JWT + Firebase)
│   ├── auth.repository.ts     # Persistência de credenciais no Firestore
│   ├── bcrypt.service.ts      # Hash e comparação de senhas
│   ├── dto/
│   │   └── login.dto.ts       # DTO de login
│   └── entities/
│       └── auth-user.entity.ts # Entidade de credenciais
├── users/                 # Módulo de usuários
│   ├── user.controller.ts     # CRUD de usuários
│   ├── user.service.ts        # Lógica de negócios de usuários
│   ├── user.repository.ts     # Persistência de usuários no Firestore
│   ├── user.entity.ts         # Entidade de usuário
│   └── dto/
│       ├── CreateUser.dto.ts   # DTO de criação
│       ├── UpdateUser.dto.ts   # DTO de atualização
│       └── ResponseUser.dto.ts # DTO de resposta
├── supply/                # Módulo de materiais didáticos (IA)
│   ├── supply.controller.ts   # Endpoints granulares (skeleton/topic/consolidate)
│   ├── supply.service.ts      # Orquestra esqueleto, tópico e consolidação
│   ├── supply.repository.ts   # Persistência no Firestore
│   ├── supply.model.ts        # Model de supply
│   ├── prompts.ts             # Composição dos prompts (esqueleto/tópico)
│   ├── dtos/
│   │   ├── SupplyInfo.dto.ts  # DTO { studentId, level } (skeleton)
│   │   ├── TopicRequest.dto.ts # DTO de geração de um tópico
│   │   └── Consolidate.dto.ts # DTO de consolidação (material completo)
│   └── gemini/
│       └── gemini.service.ts  # Provider de integração com Google Gemini
├── video/                 # Módulo de vídeos
│   ├── video.controller.ts    # CRUD de módulos de vídeo
│   ├── video.service.ts       # Lógica de negócios de vídeos
│   ├── video.repository.ts    # Persistência no Firestore
│   ├── video.entity.ts        # Entidade de vídeo (Video, VideoTopic, VideoInfo)
│   └── dtos/
│       └── video.dto.ts       # DTOs de vídeo
├── prompts/               # Módulo de prompts para IA (legado, lido pela geração)
│   ├── prompt.service.ts      # Busca de prompts por nível
│   ├── prompt.repository.ts   # Persistência no Firestore
│   └── prompt.model.ts        # Model de prompt
├── curriculum/            # Painel de prompts + estrutura curricular (Spec 008)
│   ├── curriculum.controller.ts # /curriculum (principal, nível, blueprint)
│   ├── curriculum.service.ts    # Normalização de ordem + projeção de blueprint
│   ├── curriculum.repository.ts # Persistência (coleção `curriculum`)
│   ├── curriculum.model.ts      # Interfaces (Module, Topic, LevelCurriculum)
│   └── dto/                     # UpsertPrincipalDto, UpsertLevelDto (nested)
├── guards/                # Guards globais
│   ├── auth.guard.ts          # Guard de autenticação (Firebase Token)
│   └── roles.guard.ts         # Guard de autorização por role
├── decorators/            # Decorators customizados
│   ├── public.decorator.ts    # @Public() - marca rotas públicas
│   └── roles.decorator.ts     # @Roles() - define roles necessárias
├── types/                 # Tipos compartilhados
│   ├── student.level.ts       # Type Level (A1, A2, B1, B2)
│   ├── student.info.ts        # Interface StudentInfo
│   └── student.supply.ts      # Schemas Zod (Module, Topic, Word, Music, Skeleton)
├── app.module.ts          # Módulo raiz
└── main.ts                # Bootstrap da aplicação
```

---

## 🔐 Autenticação e Autorização

### Mecanismo

A API utiliza um sistema duplo de proteção:

1. **AuthGuard (Global)** — Verifica o token Firebase ID Token enviado no header `Authorization: Bearer <token>`. Todas as rotas são protegidas por padrão.
2. **RolesGuard (Global)** — Verifica se o usuário autenticado possui a role necessária para acessar o endpoint.

### Decorators

| Decorator | Descrição |
|---|---|
| `@Public()` | Marca a rota como pública (sem autenticação) |
| `@Roles('teacher')` | Restringe o acesso à role `teacher` |

### Header de Autenticação

```
Authorization: Bearer <firebase_id_token>
```

### Fluxo de Login (JWT)

O endpoint `POST /auth/login` autentica via email/senha (credenciais internas com bcrypt) e retorna um JWT com expiração de **3 horas**.

---

## 📖 Endpoints da API

### 🔑 Auth — `/auth`

#### `POST /auth/login`

Realiza login com credenciais internas e retorna um JWT.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔓 Pública (`@Public()`) |
| **Roles** | Nenhuma |

**Request Body:**

```json
{
  "email": "professor@example.com",
  "password": "senhaSegura123"
}
```

**Response (200):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Erros:**

| Status | Descrição |
|---|---|
| `401` | Credenciais inválidas |

**Fluxo interno:**
1. Busca credenciais no Firestore (coleção `credentials`) pelo email
2. Compara a senha com o hash armazenado (bcrypt)
3. Gera um JWT contendo `{ email, sub: userId, role }`
4. Retorna o `access_token`

---

### 👤 Users — `/users`

#### `POST /users`

Cria um novo usuário (aluno ou professor).

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Request Body (`CreateUserDto`):**

```json
{
  "fullName": "João Silva",
  "phone": "11999999999",
  "email": "joao@example.com",
  "isPaying": true,
  "isTeacher": false,
  "level": "A1",
  "password": "senhaDoAluno123",
  "objective": "Aprender inglês para viagens",
  "prognosis": "Aluno com boa capacidade de aprendizado"
}
```

**Response (201) — `ResponseUserDto`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "fullName": "João Silva"
}
```

**Fluxo interno:**
1. Gera UUID v4 para o novo usuário
2. Registra credenciais (email + senha hashada + role) na coleção `credentials`
3. Salva os dados do usuário na coleção `users`
4. Retorna o ID e nome do usuário criado

---

#### `GET /users`

Retorna os usuários cadastrados. Aceita o query param opcional `role` para
filtrar por papel **no servidor** — usado pela tela de gestão de alunos para
garantir que professores nunca apareçam na listagem.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Query params:**

| Parâmetro | Valores | Descrição |
|---|---|---|
| `role` | `student` \| `teacher` | Filtra por papel (via `isTeacher`). Ex.: `GET /users?role=student` retorna **apenas alunos**. Omitido, retorna todos. |

**Response (200) — `User[]`:**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "fullName": "João Silva",
    "phone": "11999999999",
    "email": "joao@example.com",
    "isPaying": true,
    "isTeacher": false,
    "level": "A1",
    "objective": "Aprender inglês para viagens",
    "prognosis": "Aluno com boa capacidade de aprendizado"
  }
]
```

---

#### `GET /users/:id`

Busca um usuário pelo ID.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | Nenhuma (qualquer autenticado) |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `id` | `string` | UUID do usuário |

**Response (200) — `User`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "fullName": "João Silva",
  "phone": "11999999999",
  "email": "joao@example.com",
  "isPaying": true,
  "isTeacher": false,
  "level": "A1",
  "objective": "Aprender inglês para viagens",
  "prognosis": "Aluno com boa capacidade de aprendizado"
}
```

**Erros:**

| Status | Descrição |
|---|---|
| `404` | Usuário não encontrado |

---

#### `PUT /users/:id`

Atualiza os dados de um usuário.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `id` | `string` | UUID do usuário |

**Request Body (`UpdateUserDto`) — todos os campos são opcionais:**

```json
{
  "fullName": "João da Silva Atualizado",
  "phone": "11888888888",
  "email": "joao.novo@example.com",
  "isPaying": false,
  "isTeacher": false,
  "level": "A2",
  "objective": "Novo objetivo",
  "prognosis": "Novo prognóstico"
}
```

**Response (200) — `User`:**

```json
{
  "fullName": "João da Silva Atualizado",
  "phone": "11888888888",
  "email": "joao.novo@example.com",
  "isPaying": false,
  "isTeacher": false,
  "level": "A2",
  "objective": "Novo objetivo",
  "prognosis": "Novo prognóstico"
}
```

---

#### `DELETE /users/:id`

Remove um usuário.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `id` | `string` | UUID do usuário |

**Response:** `200 OK` (sem body)

---

### 📦 Supplies — `/supplies`

Materiais didáticos personalizados gerados por **IA (Google Gemini)** para cada aluno, baseados no nível, objetivos e prognóstico.

> **Geração granular (spec 006):** a geração monolítica em uma única requisição foi
> substituída por três etapas — **esqueleto → tópico (paralelo) → consolidação**.
> Isso elimina timeouts, isola falhas por tópico (uma falha não afeta as demais) e
> permite retry granular + feedback em tempo real na tela de monitoramento do FE.
> O cliente busca a "planta baixa", dispara um `POST /supplies/topic` por tópico em
> paralelo e, ao concluir todos, chama `POST /supplies/consolidate` para persistir.

#### `POST /supplies/skeleton`

Etapa 1 — gera a **planta baixa** do material: módulos com título/introdução e a
lista de títulos de tópicos, sem o conteúdo pesado. Cada tópico recebe um `id`
estável (`m{i}_t{j}`) usado pelo cliente para chavear a UI e o retry.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Request Body (`SupplyInfoDto`):** `{ "studentId": "...", "level": "A1" }`
> O campo `level` aceita os valores: `A1`, `A2`, `B1`, `B2`

**Response (201):**

```json
{
  "modules": [
    {
      "title": "Título do Módulo",
      "text": "Introdução do módulo",
      "topics": [{ "id": "m0_t0", "topic": "Greetings" }]
    }
  ]
}
```

**Erros:** `404` aluno não encontrado · `500` prompt ausente ou IA em formato inválido

---

#### `POST /supplies/topic`

Etapa 2 — gera o conteúdo **completo de um único tópico** (stateless; idempotente,
retry = refazer a chamada). O FE dispara N destas requisições em paralelo.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Request Body (`TopicRequestDto`):**

```json
{
  "studentId": "550e8400-...",
  "level": "A1",
  "moduleTitle": "Título do Módulo",
  "topicTitle": "Greetings"
}
```

**Response (201) — `Topic`:** o objeto completo do tópico (ver estrutura abaixo).

**Erros:** `404` aluno não encontrado · `500` prompt ausente ou IA em formato inválido

---

#### `POST /supplies/consolidate`

Etapa 3 — recebe o material inteiro já montado pelo cliente, **valida em
profundidade com Zod** (`SupplyModulesSchema`) e persiste uma única vez no
Firestore (coleção `student_supplies`, doc ID: `{studentId}_{level}`).

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Request Body (`ConsolidateDto`):**

```json
{
  "studentId": "550e8400-...",
  "level": "A1",
  "modules": [ { "title": "...", "text": "...", "topics": [ /* Topic[] */ ] } ]
}
```

**Response (201) — `Supply`:** `{ "studentId", "level", "modules" }`

**Erros:** `500` material inválido/incompleto na validação

**Estrutura do material persistido (Modules → Topics):**

```json
[
  {
    "title": "Título do Módulo",
    "text": "Texto introdutório do módulo",
    "topics": [
      {
        "topic": "Greetings",
        "description": "Descrição do tópico",
        "examples": ["Hello!", "How are you?"],
        "curiosity": "Curiosidade sobre o tema",
        "roleplayInstruction": "Instrução para roleplay",
        "roleplayDialog": ["Linha 1", "Linha 2"],
        "words": [
          {
            "english": "Hello",
            "portuguese": "Olá",
            "pronounce": "helôu"
          }
        ],
        "music": {
          "title": "Hello",
          "artist": "Adele",
          "youtube": "https://youtube.com/..."
        }
      }
    ]
  }
]
```

**Erros:**

| Status | Descrição |
|---|---|
| `404` | Aluno não encontrado |
| `500` | Prompt não encontrado ou resposta da IA inválida |

---

#### `GET /supplies/:studentId`

Retorna todos os materiais didáticos de um aluno.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | Nenhuma (qualquer autenticado) |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `studentId` | `string` | UUID do aluno |

**Response (200) — `Supply[]`:**

```json
[
  {
    "studentId": "550e8400-...",
    "level": "A1",
    "modules": [...]
  }
]
```

---

#### `GET /supplies/:studentId/:level`

Retorna o material didático de um aluno em um nível específico.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | Nenhuma (qualquer autenticado) |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `studentId` | `string` | UUID do aluno |
| `level` | `string` | Nível (`A1`, `A2`, `B1`, `B2`) |

**Response (200) — `Supply | null`:**

```json
{
  "studentId": "550e8400-...",
  "level": "A1",
  "modules": [...]
}
```

---

### 🎬 Videos — `/videos`

Módulos de vídeo organizados por nível e tópico.

#### `GET /videos/:level`

Retorna todos os módulos de vídeo de um nível.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | Nenhuma (qualquer autenticado) |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `level` | `string` | Nível do módulo (`A1`, `A2`, `B1`, `B2`) |

**Response (200) — `Video[]`:**

```json
[
  {
    "index": 1,
    "level": "A1",
    "topic": [
      {
        "title": "Greetings",
        "description": "Cumprimentos básicos",
        "videos": [
          {
            "youtubeId": "dQw4w9WgXcQ",
            "title": "Aula 1 - Cumprimentos",
            "internalHash": "abc123",
            "order": 1
          }
        ]
      }
    ]
  }
]
```

**Erros:**

| Status | Descrição |
|---|---|
| `404` | Módulo de nível não encontrado |

---

#### `POST /videos`

Cria ou atualiza um módulo de vídeo.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Request Body (`VideoModuleDto`):**

```json
{
  "index": 1,
  "level": "A1",
  "topic": [
    {
      "title": "Greetings",
      "description": "Cumprimentos básicos em inglês",
      "videos": [
        {
          "youtubeId": "dQw4w9WgXcQ",
          "title": "Aula 1 - Cumprimentos",
          "internalHash": "abc123",
          "order": 1
        }
      ]
    }
  ]
}
```

**Response:** `201 Created` (sem body)

> O documento é salvo com ID `{level}_{index}` (ex: `A1_1`)

---

#### `DELETE /videos/:level/:index/:topic/:youtubeId`

Remove um vídeo específico de dentro de um tópico de um módulo.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `level` | `string` | Nível do módulo |
| `index` | `number` | Índice do módulo |
| `topic` | `string` | Título do tópico |
| `youtubeId` | `string` | ID do vídeo no YouTube |

**Response:** `200 OK` (sem body)

**Erros:**

| Status | Descrição |
|---|---|
| `404` | Módulo ou tópico não encontrado |

**Fluxo interno:**
1. Busca o módulo de vídeo pelo nível e índice
2. Localiza o tópico pelo título
3. Remove o vídeo com o `youtubeId` correspondente do array de vídeos
4. Salva o documento atualizado no Firestore

---

### 👥 Turmas — `/turmas`

Grupos nomeados de alunos, alocáveis num slot da agenda. Todas as rotas exigem role `teacher`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/turmas` | Lista todas as turmas |
| `POST` | `/turmas` | Cria turma — body `{ name, studentIds[], studentNames[] }` |
| `PUT` | `/turmas/:id` | Substitui a turma (mesmo body do POST) |
| `DELETE` | `/turmas/:id` | Exclui a turma |

---

### 🗓️ Agenda — `/agenda`

Grade **semanal recorrente**. Cada slot `(dayOfWeek, hour)` tem no máximo **um** ocupante:
um aluno avulso **ou** uma turma. Unicidade garantida pelo docId `${dayOfWeek}_${hour}`.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/agenda` | `teacher` | Grade completa (slots ocupados; slots de turmas excluídas são omitidos) |
| `GET` | `/agenda/student/:studentId` | autenticado | Horário resolvido do aluno (individual + turmas) → `StudentSchedule[]` |
| `POST` | `/agenda` | `teacher` | Atribui/atualiza slot (upsert). Body `{ dayOfWeek:0-6, hour:8-20, occupantType:'student'\|'turma', studentId?, studentName?, turmaId?, turmaName? }` |
| `DELETE` | `/agenda/:dayOfWeek/:hour` | `teacher` | Libera o slot |

---

### 🧩 Curriculum — `/curriculum`

Painel de **prompts e estrutura curricular** (Spec 008). É a "planta baixa" editável
que alimenta a geração de material: prompt principal (global), prompt por nível e a
árvore ordenada de **módulos → tópicos**. Todas as rotas exigem role `teacher`.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/curriculum/principal` | Prompt Principal (global) — `{ prompt }` |
| `PUT` | `/curriculum/principal` | Salva o Prompt Principal — body `{ prompt }` |
| `GET` | `/curriculum/levels/:level` | Estrutura completa do nível — `{ level, prompt, modules[] }` |
| `PUT` | `/curriculum/levels/:level` | Salva o nível inteiro (prompt + árvore) — body `{ prompt, modules[] }` |
| `GET` | `/curriculum/levels/:level/blueprint` | Planta baixa ordenada e enxuta para a geração paralela |

- `:level` ∈ `A1|A2|B1|B2` (400 se inválido).
- **Ordem = posição no array.** O cliente envia `modules`/`topics` na ordem desejada; o
  backend deriva e persiste `order` pelo índice (fonte única de verdade). IDs ausentes são
  gerados no servidor.
- **Body do `PUT /levels/:level`:**
  ```json
  {
    "prompt": "Contexto do nível A1...",
    "modules": [
      {
        "id": "opcional",
        "title": "Rotina Diária",
        "context": "Diretriz temática do módulo",
        "topics": [
          { "id": "opcional", "prompt": "Gere um diálogo pedindo o menu" }
        ]
      }
    ]
  }
  ```
- **Blueprint (`GET /levels/:level/blueprint`)** retorna `{ level, modules: [{ id, title, context, topics: [{ id, prompt }] }] }`, já ordenado.
- **Composição do prompt final** (na geração paralela, uma requisição por tópico):
  `[Prompt Principal] + [Prompt do Nível] + [Contexto do Módulo] + [Prompt do Tópico] + [Dados do Aluno]`.
  Variáveis de interpolação previstas: `{{nome_aluno}}`, `{{objetivos}}`, `{{prognostico}}`.
  > A **integração do fluxo de geração** com este blueprint é da geração granular (Spec 006) e
  > será conectada quando aquela spec for mesclada; a coleção `curriculum` é intencionalmente
  > **desacoplada** da coleção legada `prompts` (consumida hoje por `SupplyService`).

---

## 📊 Estrutura de Dados e Coleções do Firestore

Abaixo está a estrutura de dados armazenada em cada coleção do banco de dados:

### 1. `credentials`
Armazena as informações de autenticação (email, senha com hash e função do usuário).
- **Doc ID:** UUID do usuário (mesmo ID da coleção `users`)
```json
{
  "id": "string (UUID)",
  "email": "string",
  "password": "string (hash bcrypt)",
  "role": "string (ex: 'teacher' ou 'student')"
}
```

### 2. `users`
Armazena os dados pessoais e de perfil dos usuários (alunos e professores).
- **Doc ID:** UUID do usuário
```json
{
  "id": "string (UUID)",
  "fullName": "string",
  "phone": "string",
  "email": "string",
  "isPaying": "boolean",
  "isTeacher": "boolean",
  "level": "string (ex: 'A1')",
  "objective": "string",
  "prognosis": "string"
}
```

### 3. `student_supplies`
Armazena os materiais didáticos personalizados gerados pela IA (Google Gemini).
- **Doc ID:** `{studentId}_{level}`
```json
{
  "studentId": "string (UUID)",
  "level": "string",
  "modules": [
    {
      "title": "string",
      "text": "string",
      "topics": [
        {
          "topic": "string",
          "description": "string",
          "examples": ["string"],
          "curiosity": "string",
          "roleplayInstruction": "string",
          "roleplayDialog": ["string"],
          "words": [
            {
              "english": "string",
              "portuguese": "string",
              "pronounce": "string"
            }
          ],
          "music": {
            "title": "string",
            "artist": "string",
            "youtube": "string"
          }
        }
      ]
    }
  ]
}
```

### 4. `videos`
Armazena os módulos de vídeos, agrupados por nível.
- **Doc ID:** `{level}_{index}`
```json
{
  "index": "number",
  "level": "string (ex: 'A1')",
  "topic": [
    {
      "title": "string",
      "description": "string",
      "videos": [
        {
          "youtubeId": "string",
          "title": "string",
          "internalHash": "string",
          "order": "number"
        }
      ]
    }
  ]
}
```

### 5. `prompts`
Armazena os templates de prompt utilizados pela integração do Gemini, categorizados por nível.
- **Doc ID:** UUID automático ou Identificador de Nível
```json
{
  "level": "string (ex: 'A1')",
  "prompt": "string (texto do prompt base)"
}
```

### 6. `turmas`
Grupos nomeados de alunos.
- **Doc ID:** UUID automático
```json
{
  "name": "string",
  "studentIds": ["string"],
  "studentNames": ["string"]
}
```

### 7. `agenda`
Slots da grade semanal recorrente (1 ocupante por slot).
- **Doc ID:** `${dayOfWeek}_${hour}` (ex.: `2_15` = terça às 15h)
```json
{
  "dayOfWeek": "number (0=domingo … 6=sábado)",
  "hour": "number (8..20)",
  "occupantType": "'student' | 'turma'",
  "studentId": "string (se occupantType='student')",
  "studentName": "string (se occupantType='student')",
  "turmaId": "string (se occupantType='turma')",
  "turmaName": "string (se occupantType='turma')"
}
```

### 8. `curriculum`
Planta baixa editável de prompts/estrutura curricular (Spec 008).
- **Doc ID:** `principal` (prompt global) **ou** o nível (`A1`..`B2`).
```json
// doc "principal"
{ "prompt": "string (persona/formato/diretrizes globais)" }

// doc "A1" (por nível)
{
  "level": "string ('A1'..'B2')",
  "prompt": "string (prompt do nível)",
  "modules": [
    {
      "id": "string",
      "title": "string",
      "context": "string (diretriz temática do módulo)",
      "order": "number (índice)",
      "topics": [
        { "id": "string", "prompt": "string (instrução granular)", "order": "number" }
      ]
    }
  ]
}
```
> Coleção **desacoplada** da legada `prompts`: a `curriculum` é a fonte do painel e do
> blueprint; a `prompts` continua sendo lida pela geração atual até a integração da Spec 006.

---

## 🔄 CORS

Origens permitidas:

- `https://dev.barbarafarias.com.br`
- `https://barbarafarias.com.br`
- `https://www.barbarafarias.com.br`
- `http://localhost:3000`
- `http://localhost:4200`

---

## 🧪 Testes

```bash
# Executar testes
npm run test

# Testes com watch
npm run test:watch

# Cobertura de testes
npm run test:cov

# Testes end-to-end
npm run test:e2e
```

---

## 📝 Scripts Disponíveis

| Script | Comando | Descrição |
|---|---|---|
| `start` | `nest start` | Inicia a aplicação |
| `start:dev` | `nest start --watch` | Desenvolvimento com hot-reload |
| `start:debug` | `nest start --debug --watch` | Debug com hot-reload |
| `start:prod` | `node dist/main` | Produção |
| `build` | `npm run test && nest build` | Roda testes e compila |
| `test` | `jest` | Executa testes unitários |
| `lint` | `eslint --fix` | Lint e correção automática |
| `format` | `prettier --write` | Formatação de código |

---

## 🐳 Docker

O projeto inclui um `Dockerfile` para containerização e um `.dockerignore` configurado.

---

## ☁️ Deploy

O deploy é realizado na **GCP**. As credenciais do Firebase são carregadas via variável de ambiente `FIREBASE_SERVICE_ACCOUNT_BASE64` (Base64 do Service Account JSON).
