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
| `RESEND_API_KEY` | Chave da [Resend](https://resend.com) para e-mail transacional |
| `RESEND_FROM` | *(opcional)* Remetente próprio, ex.: `Bárbara Farias <no-reply@barbarafarias.com.br>` |

> **`.env.example`** na raiz lista todas as variáveis obrigatórias — copie para `.env` e preencha.
>
> Para as notificações, **basta a `RESEND_API_KEY`**: sem `RESEND_FROM` o SDK usa o remetente
> compartilhado da Resend (`onboarding@resend.dev`), que já funciona. Ele entrega para o
> e-mail dono da conta; para enviar a qualquer destinatário, verifique o domínio na Resend
> (SPF/DKIM no DNS) e defina `RESEND_FROM` — é só a variável, sem mexer em código.
>
> Sem `RESEND_API_KEY` o envio é desativado silenciosamente: a operação continua
> funcionando, só não manda e-mail.

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
│       ├── UpdateUser.dto.ts   # DTO de atualização (gerência)
│       ├── UpdateProfile.dto.ts # DTO de auto-edição do perfil (Spec 011)
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
├── teachers/              # Corpo docente (Spec 010)
│   ├── teacher.controller.ts  # /teachers (CRUD, roster, /me, /mine)
│   ├── teacher.service.ts     # Cadastro com rollback, desativação, designação
│   ├── teacher.repository.ts  # Recorte de professoras na coleção `users`
│   └── dto/                   # Create/Update, ResponseTeacher (por papel), AssignStudents
├── lessons/               # Aulas datadas (Spec 010)
│   ├── lesson.controller.ts   # /lessons (período, dia, acesso, presença, avaliação)
│   ├── lesson.service.ts      # Materialização, escopo, presença, cancelamento
│   ├── lesson-access.service.ts # Janela 10/15/20 min e prazos (4h, 72h)
│   ├── makeup.service.ts      # Reposição no slot combinado, com empurrão por conflito
│   ├── lesson.repository.ts   # Coleção `lessons` (docId determinístico)
│   └── lesson.entity.ts       # Lesson, status, origem, presença, avaliação
├── reschedules/           # Reagendamento com aprovação (Spec 010)
│   ├── reschedule.controller.ts # /lessons/:id/reschedule-* e /reschedule-requests
│   ├── reschedule.service.ts    # Regras de 4h, sugestão pós-ausência, decisão
│   └── reschedule.entity.ts     # kind, status, motivo classificado
├── articles/              # Material de apoio em Markdown (Spec 011)
│   ├── article.controller.ts  # /articles — escrita da gerente, leitura de todos
│   ├── article.service.ts     # CRUD + carimbo de autor e datas
│   ├── article.repository.ts  # Coleção `articles`
│   ├── article.entity.ts      # Article (content = Markdown cru)
│   └── dto/article.dto.ts     # Create/Update + ArticleSummaryDto (excerpt)
├── billing/               # Financeiro (Spec 010)
│   ├── billing.controller.ts    # /billing (settings, summary, detalhe, pagar)
│   ├── billing.service.ts       # Valor-hora vigente, `payable`, congelamento
│   ├── billing-summary.service.ts # Fechamento mensal por professora
│   ├── finance.controller.ts    # /finance — faturamento sob a ótica da professora (Spec 011)
│   ├── teacher-earnings.service.ts # Projeção semanal/mensal por alunos ativos (Spec 011)
│   └── payout.provider.ts       # Porta de pagamento (ManualPix hoje, AbacatePay depois)
├── feedbacks/             # Acompanhamento pedagógico (Spec 010)
│   ├── feedback.controller.ts # /students/:id/feedbacks
│   └── feedback.service.ts    # Escopo: professora responsável ou gerente
├── notifications/         # E-mail transacional via Resend (Spec 010)
│   ├── notification.service.ts # Eventos → destinatários (nunca lança)
│   ├── resend.service.ts       # Cliente isolado de falhas
│   └── templates.ts            # Templates por evento
├── admin/                 # Rotinas de manutenção (Spec 010)
│   └── admin.service.ts       # Migração de papéis + docIds da agenda
├── common/
│   ├── time.ts            # Fuso America/Sao_Paulo, datas e slots recorrentes
│   ├── slot-time.ts       # Grade de 30 min: validação, cobertura e rótulo (Spec 011)
│   ├── patch.ts           # pickDefined — merge parcial sem apagar campo gravado
│   ├── cors.config.ts
│   └── filters/
├── guards/                # Guards globais
│   ├── auth.guard.ts          # Guard de autenticação (Firebase Token)
│   └── roles.guard.ts         # Guard de autorização por role (manager herda teacher)
├── decorators/            # Decorators customizados
│   ├── public.decorator.ts    # @Public() - marca rotas públicas
│   ├── roles.decorator.ts     # @Roles() - define roles necessárias
│   └── current-user.decorator.ts # @CurrentUser() - payload do JWT
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
| `@Roles(ROLES.MANAGER)` | Restringe à gerente |
| `@Roles(ROLES.MANAGER, ROLES.TEACHER)` | Operação de aula (a professora fica restrita às próprias) |
| `@CurrentUser()` | Injeta o payload do JWT (`{ sub, email, role }`) no handler |

### Papéis

`manager` · `teacher` · `student` (`src/types/role.ts`).

- **A gerente herda as permissões da professora** no `RolesGuard`: rotas anotadas com
  `@Roles(TEACHER)` também liberam `manager`. Sem isso, migrar a gerente para `manager`
  a barraria em todo o painel legado.
- **`users.role` é a fonte única do papel.** É o campo que todas as consultas do servidor
  usam — listar professoras, achar as gerentes para notificar, filtrar alunos. O Firestore
  não faz join, então o papel precisa morar no documento consultado.
- **O login lê o papel de `users`** (uma leitura a mais por login, não por requisição — o JWT
  carrega a role depois disso). `credentials` guarda o que a autenticação precisa: e-mail e
  hash da senha.
- **`credentials.role` é ponte de transição**, não fonte: quem ainda não tem `users.role`
  continua entrando com o papel certo, e um rollback do deploy não tranca ninguém. Sai de
  cena quando a base estiver migrada.
- Precedência no login: `users.role` → `credentials.role` → `isTeacher` (legado) → `student`
  (menor privilégio). Mesma ordem usada por `POST /admin/migrate-roles`.
- **Promover alguém à mão:** edite `users/{id}.role`. Depois é só relogar — ou rodar
  "Corrigir papéis dos usuários" no painel, que propaga para o resto da base.

#### Onde a herança gerente→professora **não** vale (spec 011 RF2.1)

Gestão de alunos exige `manager` explicitamente, sem herança:

| Rota | Antes | Agora |
|---|---|---|
| `POST /users` | `teacher` | **`manager`** — a professora não cadastra alunos |
| `DELETE /users/:id` | `teacher` | **`manager`** — excluir é ato de gestão |
| `GET /users` | `teacher` (base inteira) | `manager` \| `teacher` **com escopo**: a professora só recebe os alunos com `teacherId === user.sub` |

`PUT /users/:id` **continua** liberado para `teacher`: nível, objetivo e prognóstico são
dados pedagógicos que a professora mantém. A restrição é sobre **quem entra e sai da
base**, não sobre o acompanhamento do aluno.

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
| **Roles** | `manager` |

> **Spec 011 RF2.1:** cadastrar aluno é ato de gestão. A professora **não** cria alunos —
> a rota exige `manager`, sem a herança que `@Roles(teacher)` concedia.

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

**Escopo por papel:** a gerente recebe a base inteira; a **professora recebe apenas os
alunos vinculados a ela** (`teacherId === user.sub`). O recorte é aplicado no
`UserService`, não pelo cliente — nenhuma rota devolve a base crua para quem não é
gerente. O filtro usa `resolveRole`, então também alcança documentos legados sem `role`.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `manager`, `teacher` (com escopo) |

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
| **Roles** | `manager` |

**Parâmetros de rota:**

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `id` | `string` | UUID do usuário |

**Response:** `200 OK` (sem body)

---

#### `GET /users/me` e `PATCH /users/me`

Perfil do **aluno logado** e a edição que ele mesmo faz dele (spec 011 RF14).

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `student` |

**Request Body (`UpdateProfileDto`):**

```json
{
  "fullName": "João Silva",
  "phone": "11999999999",
  "profileImageUrl": "https://firebasestorage.../avatars/uid.jpg"
}
```

> A whitelist é intencional e **não** é a mesma do `PUT /users/:id`. Papel, professora
> responsável, nível e situação de pagamento continuam exclusivos da gerente — sem esse
> recorte, um aluno poderia se promover ou trocar de professora pelo próprio painel.

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

Grade **semanal recorrente de cada professora** — é o **contrato** (quando a aula acontece
toda semana); as aulas datadas (`/lessons`) são os **fatos**. Cada slot
`(teacherId, dayOfWeek, hour)` tem no máximo **um** ocupante: um aluno avulso **ou** uma
turma. Unicidade pelo docId `${teacherId}_${dayOfWeek}_${hour}` — duas professoras podem
usar o mesmo dia/hora.

#### Granularidade de 30 minutos

`hour` é **decimal**: `8` = 08:00, `8.5` = 08:30. A grade vai de **08:00 a 20:30** em
passos de meia hora (`src/common/slot-time.ts` é a fonte única desse vocabulário).

A representação decimal foi escolhida para **preservar os documentos já gravados**: hora
cheia continua serializando sem casas (`..._8`), então nenhuma migração do Firestore foi
necessária — só as meias-horas estreiam ids com `.5`.

Uma **aula padrão de 1 hora ocupa 2 slots consecutivos** e grava **dois documentos**,
ambos apontando para o mesmo `startHour`:

| Campo | Significado |
|---|---|
| `hour` | A meia-hora deste documento |
| `startHour` | Início do bloco ao qual ele pertence |
| `slotCount` | `1` = meia hora, `2` = uma hora |

- **Colisão:** `POST /agenda` responde **409** se qualquer meia-hora do bloco já estiver
  tomada — inclusive por um bloco que começou 30 min antes e se estende sobre ela.
  Reescrever o mesmo bloco (mesmo `startHour`) é edição, não conflito.
- **Liberação:** apagar qualquer metade derruba o bloco inteiro.
- **Documentos legados** (sem `startHour`/`slotCount`) são lidos como bloco de 1 hora
  começando na própria hora — sem isso, a meia-hora seguinte a uma aula antiga apareceria
  livre e permitiria sobreposição.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/agenda?teacherId=` | `manager`, `teacher` | Grade. A gerente vê todas (ou filtra); a professora fica presa à própria |
| `GET` | `/agenda/student/:studentId` | autenticado (dono) | Horário resolvido do aluno (individual + turmas) → `StudentSchedule[]`. Só o slot inicial de cada bloco vira item, com a duração em `slotCount` |
| `POST` | `/agenda` | `manager`, `teacher` | Atribui/atualiza bloco. Body `{ teacherId, teacherName?, dayOfWeek:0-6, hour:8–20.5 (passo 0.5), slotCount?:1\|2, occupantType:'student'\|'turma', studentId?, studentName?, turmaId?, turmaName? }`. **409** em colisão |
| `DELETE` | `/agenda/:teacherId/:dayOfWeek/:hour` | `manager`, `teacher` | Libera o bloco inteiro a partir de qualquer uma das metades |

---

### 👩‍🏫 Teachers — `/teachers`

Corpo docente. Dados sensíveis (CPF, CNPJ, PIX, valor-hora) só trafegam para `manager` —
o DTO público entrega apenas nome e, se a professora permitir, telefone.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/teachers` | `manager` | Lista com resumo (nº de alunos) |
| `POST` | `/teachers` | `manager` | Cadastra + cria credenciais. Body `{ fullName, email, password, phone, pixKey, cpf, cnpj?, hourlyRate?, phoneVisibleToStudent? }` |
| `GET` | `/teachers/:id` | `manager` | Detalhe completo |
| `PUT` | `/teachers/:id` | `manager` | Atualiza (inclui `hourlyRate`) |
| `PATCH` | `/teachers/:id/active` | `manager` | Desativa/reativa. Ao desativar, marca os alunos como `pendingTeacher` |
| `GET` | `/teachers/:id/students` | `manager` | Alunos da professora |
| `PUT` | `/teachers/:id/students` | `manager` | Substitui o roster. Body `{ studentIds[] }` |
| `PATCH` | `/teachers/students/:studentId` | `manager` | Config do aluno: `{ teacherId?, lessonsPerWeek?, makeupSlot?, meetUrl? }` |
| `GET` | `/teachers/me` | `manager`, `teacher` | Perfil próprio |
| `PATCH` | `/teachers/me` | `manager`, `teacher` | **Edição do próprio perfil**: `{ fullName?, phone?, profileImageUrl?, bio? }` |
| `PATCH` | `/teachers/me/phone-visibility` | `manager`, `teacher` | Body `{ visible }` |
| `GET` | `/teachers/mine` | `student` | Professora responsável (DTO público: nome, foto, bio e — se permitido — telefone) |

> `PATCH /teachers/me` é deliberadamente separado de `PUT /teachers/:id`: a professora
> edita nome, telefone, foto e bio; **dados fiscais e valor-hora continuam saindo só pelo
> painel da gerente**.

---

### 🕐 Lessons — `/lessons`

**Aula datada** (`lessons`), 60 min, docId determinístico
`${teacherId}_${occupantId}_${date}_${hour}` — materializar de novo nunca duplica.
As aulas nascem sob demanda da grade recorrente (`ensureLessons`), **nunca no passado**.

> ⚠️ **Exige índices compostos no Firestore.** As duas consultas de período filtram por dono
> (igualdade) **e** por janela de datas (intervalo) — combinação que o Firestore não resolve
> com os índices automáticos de campo único. Sem eles, a rota devolve **500
> `FAILED_PRECONDITION`**. Ver [Índices do Firestore](#-índices-do-firestore).

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/lessons?from=&to=&teacherId=` | `manager`, `teacher` | Aulas do período (semana/mês) |
| `GET` | `/lessons/day?date=` | `manager` | Aulas do dia (painel da gerente) |
| `GET` | `/lessons/student/:id?from=&to=` | autenticado (dono) | Aulas do aluno (individuais + turmas) |
| `GET` | `/lessons/:id/access` | autenticado (dono) | `{ state:'closed'\|'open'\|'missed', startAt, status, meetUrl? }` — registra a entrada |
| `POST` | `/lessons/:id/attendance` | `manager`, `teacher` (dona) | Presença manual, até 72 h. Body `{ present }` |
| `POST` | `/lessons/:id/student-cancel` | `student` (dono) | Aviso de ausência, mínimo 4 h antes |
| `POST` | `/lessons/:id/rating` | `student` (dono) | Avaliação. Body `{ stars:1-5, comment? }` |

**Janela de entrada** (relógio do servidor, fuso `America/Sao_Paulo`), com `T` = início:

| Momento | Aluno | Professora |
|---|---|---|
| antes de `T-10min` | fechada | fechada |
| `T-10min` … `T+15min` | **aberta** (link do Meet) | **aberta** |
| `T+15min` … `T+20min` | **aula perdida** → reposição automática | aberta (sem limite superior) |
| depois de `T+20min` | fechada → `student_no_show` | aberta até a aula fechar |

**Presença:** o clique em "entrar" é o gatilho primário; a marcação manual da professora
(≤72 h) prevalece; sem marcação, o sistema fecha pelos gatilhos primários.

**Reposição:** falta ou aviso do aluno cria a aula no `makeupSlot` combinado; slot ocupado
empurra para a semana seguinte e avisa. Aula de **turma não gera reposição**.

**Status:** `scheduled` · `completed` · `student_no_show` · `student_cancelled` ·
`teacher_absence` · `cancelled`.

---

### 🔁 Reschedule — `/lessons/:id/reschedule-*` e `/reschedule-requests`

Reagendamento pedido pela professora e decidido pela gerente. Dois tipos, **uma fila só**:
`planned` (≥4 h de antecedência) e `no_show` (confirmação após ausência não avisada).
Motivo classificado: `saude` · `imprevisto` · `pessoal` · `outro` (exige descrição).

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/lessons/:id/reschedule-suggestion` | `manager`, `teacher` | Data sugerida após ausência |
| `POST` | `/lessons/:id/reschedule-requests` | `manager`, `teacher` (dona) | Cria a solicitação |
| `GET` | `/reschedule-requests` | `manager` | Fila pendente |
| `GET` | `/reschedule-requests/mine` | `manager`, `teacher` | Acompanhamento próprio |
| `POST` | `/reschedule-requests/:id/approve` | `manager` | Original vira `teacher_absence` (não paga) + cria a remarcada |
| `POST` | `/reschedule-requests/:id/reject` | `manager` | Mantém a aula original |

---

### 💰 Billing — `/billing`

**A professora é paga por hora contratada sob a responsabilidade dela.** Só não recebe
quando **ela** não entrega a aula:

| Situação | Paga? |
|---|---|
| `completed` | ✅ |
| `student_no_show` (faltou sem avisar) | ✅ |
| `student_cancelled` (avisou ≥4 h) | ✅ |
| reposição, quando acontecer | ✅ |
| `teacher_absence` | ❌ |
| `cancelled` | ❌ |

`rateApplied` é congelado no fechamento da aula: mudar o valor-hora não mexe no passado.
Valor vigente = `teacher.hourlyRate ?? settings.defaultHourlyRate` (padrão **R$ 60/h**).
A gerente aparece marcada (`isManager`) e **não entra na folha como despesa**.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET`/`PUT` | `/billing/settings` | `manager` | Valor-hora global |
| `GET` | `/billing/summary?month=YYYY-MM` | `manager` | Fechamento por professora |
| `GET` | `/billing/summary/:teacherId?month=` | `manager` | Detalhe aula a aula |
| `POST` | `/billing/summary/:teacherId/pay?month=` | `manager` | Instrução de pagamento (`PayoutProvider`) |

#### Faturamento da professora — `/finance`

Projeção sob a ótica da professora (spec 011 RF12.1). Vive **fora de `/billing`** porque
aquele é o painel de fechamento da gerente e carrega PIX, CPF e a folha inteira.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/finance/teacher/me` | `manager`, `teacher` | Projeção da professora logada |
| `GET` | `/finance/teacher/:teacherId` | `manager` (ou a própria) | Projeção de uma professora |

```jsonc
{
  "teacherId": "…",
  "hourlyRate": 60,
  "activeStudents": 8,
  "lessonsPerWeek": 11,   // soma de lessonsPerWeek dos alunos ativos
  "weekly": 660,          // lessonsPerWeek × hourlyRate
  "monthly": 2857.8,      // weekly × 4.33
  "currency": "BRL"
}
```

> É uma **projeção contratual**, não o fechamento: parte dos alunos **ativos** vinculados
> (aluno `pendingTeacher` não conta) e da carga semanal de cada um. O apurado real, aula a
> aula, continua no `BillingSummaryService`. Aluno sem `lessonsPerWeek` conta como 1.

> O pagamento é **PIX manual** (`ManualPixProvider`). A porta `PayoutProvider` existe para
> trocar por AbacatePay sem tocar em controller nem em regra de negócio.

---

### 📈 Feedbacks — `/students/:studentId/feedbacks`

Acompanhamento pedagógico da professora sobre o aluno, em coleção própria
(`student_feedbacks`). **Separado do `prognosis`** de propósito: aquele campo alimenta o
prompt de geração de material; este é registro humano. Visível para a professora
responsável e para a gerente — **não** para o aluno.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/students/:id/feedbacks` | `manager`, `teacher` (responsável) | Histórico cronológico |
| `POST` | `/students/:id/feedbacks` | `manager`, `teacher` (responsável) | Body `{ text, perceivedLevel?, lessonId?, date? }` |

---

### 🛠️ Admin — `/admin`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/admin/migrate-roles` | `manager` | Grava `role` em `users` + sincroniza `credentials`, e migra os docIds antigos da agenda para a gerente. Idempotente |

Precedência do papel: `users.role` → `credentials.role` → `isTeacher` (legado). A ordem
respeita o ajuste manual da gerente em `credentials` e nunca rebaixa `manager` → `teacher`.

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

### 📝 Articles — `/articles`

Material de apoio escrito em **Markdown** (spec 011 RF7–RF10). Substitui a antiga página
do IPA como repositório de conteúdo.

**Escrita é exclusiva da gerente; leitura é aberta a qualquer usuário autenticado** — é o
material que aluno e professora consultam.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/articles` | autenticado | Lista (`ArticleSummaryDto`), mais recente primeiro |
| `GET` | `/articles/:id` | autenticado | Artigo completo, com o Markdown cru |
| `POST` | `/articles` | `manager` | Cria. Body `{ title, content, coverImageUrl? }` |
| `PUT` | `/articles/:id` | `manager` | Atualiza (parcial); renova `updatedAt` |
| `DELETE` | `/articles/:id` | `manager` | Remove (**204**; **404** se não existir) |

- `content` guarda **Markdown cru** — a renderização e a **sanitização contra XSS**
  acontecem no front (`ngx-markdown`). A API não confia no conteúdo nem o interpreta.
- `coverImageUrl` aponta para o **Firebase Storage**; o binário nunca entra no Firestore.
- A **listagem não devolve o corpo**: `ArticleSummaryDto` carrega um `excerpt` de 180
  caracteres já limpo de marcação, para a lista não arrastar dezenas de textos longos.
- `authorName` é gravado junto do artigo (o JWT só tem `sub`/`email`/`role`), evitando um
  join a cada leitura.

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
  "prognosis": "string",

  "profileImageUrl": "string? — URL no Firebase Storage (spec 011)",
  "bio": "string? — apresentação da professora, ≤600 chars (spec 011)"
}
```

> `profileImageUrl` vale para **todos** os papéis; `bio` só é preenchida para
> professora/gerente. A imagem é comprimida e redimensionada **no cliente** antes do
> upload (256×256 para avatar) — o Firestore guarda apenas a URL.

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
Slots da grade semanal recorrente (1 ocupante por slot **de 30 min**).
- **Doc ID:** `${teacherId}_${dayOfWeek}_${hour}` (ex.: `abc_2_15` = terça às 15:00;
  `abc_2_15.5` = terça às 15:30)
```json
{
  "teacherId": "string — professora dona do slot",
  "teacherName": "string?",
  "dayOfWeek": "number (0=domingo … 6=sábado)",
  "hour": "number (8 … 20.5, passo 0.5) — 8.5 = 08:30",
  "startHour": "number — início do bloco a que este slot pertence",
  "slotCount": "number (1=meia hora, 2=uma hora)",
  "occupantType": "'student' | 'turma'",
  "studentId": "string (se occupantType='student')",
  "studentName": "string (se occupantType='student')",
  "turmaId": "string (se occupantType='turma')",
  "turmaName": "string (se occupantType='turma')"
}
```

> **Aula de 1 hora = 2 documentos** (`_8` e `_8.5`), ambos com `startHour: 8` e
> `slotCount: 2`. Documentos **anteriores à spec 011** não têm `startHour`/`slotCount` e
> são lidos como bloco de 1 hora começando na própria hora — por isso **nenhuma migração
> foi necessária**.

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

### 9. `articles`
Material de apoio em Markdown (spec 011). Substitui a antiga página do IPA.
- **Doc ID:** UUID gerado na criação
```json
{
  "title": "string (≤160 chars)",
  "content": "string — Markdown cru, renderizado e sanitizado no front",
  "coverImageUrl": "string? — URL no Firebase Storage",
  "authorId": "string — uid da gerente que escreveu",
  "authorName": "string? — nome de exibição, gravado para evitar join na listagem",
  "createdAt": "string ISO",
  "updatedAt": "string ISO"
}
```

> A ordenação da listagem (mais recente primeiro) é feita **em memória**: a coleção é
> pequena e curada pela gerente, então não exige índice composto.

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

## 🔎 Índices do Firestore

O Firestore cria índices de campo único sozinho e resolve consultas **só de igualdade**
combinando-os. Composto é obrigatório quando a mesma consulta tem **igualdade + intervalo** —
o caso das aulas, que filtram por dono e por janela de datas. Sem o índice, a consulta falha
com `9 FAILED_PRECONDITION: The query requires an index`.

| Coleção | Campos | Serve |
|---|---|---|
| `lessons` | `studentId` ASC, `date` ASC | `GET /lessons/student/:id?from=&to=` — painel do aluno |
| `lessons` | `teacherId` ASC, `date` ASC | `GET /lessons?from=&to=&teacherId=` — agenda semanal/mensal e financeiro |

Os dois estão versionados em **`firestore.indexes.json`**. Para publicar:

```bash
# uma vez por projeto (dev e produção têm índices separados)
firebase deploy --only firestore:indexes --project <id-do-projeto>
```

Alternativa: a mensagem de erro do Firestore traz um **link direto** que cria o índice faltante
pelo console — resolve o caso pontual, mas prefira o arquivo, que documenta a necessidade e
mantém os ambientes iguais.

> A criação leva de segundos a alguns minutos; enquanto o índice está *Building*, a consulta
> continua falhando.

---

## ☁️ Deploy

O deploy é realizado na **GCP**. As credenciais do Firebase são carregadas via variável de ambiente `FIREBASE_SERVICE_ACCOUNT_BASE64` (Base64 do Service Account JSON).
