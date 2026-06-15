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
│   ├── supply.controller.ts   # Endpoints de supply
│   ├── supply.service.ts      # Geração de conteúdo via Gemini
│   ├── supply.repository.ts   # Persistência no Firestore
│   ├── supply.model.ts        # Model de supply
│   ├── dtos/
│   │   └── SupplyInfo.dto.ts  # DTO de criação de supply
│   └── gemini/
│       └── gemini.service.ts  # Provider de integração com Google Gemini
├── video/                 # Módulo de vídeos
│   ├── video.controller.ts    # CRUD de módulos de vídeo
│   ├── video.service.ts       # Lógica de negócios de vídeos
│   ├── video.repository.ts    # Persistência no Firestore
│   ├── video.entity.ts        # Entidade de vídeo (Video, VideoTopic, VideoInfo)
│   └── dtos/
│       └── video.dto.ts       # DTOs de vídeo
├── prompts/               # Módulo de prompts para IA
│   ├── prompt.service.ts      # Busca de prompts por nível
│   ├── prompt.repository.ts   # Persistência no Firestore
│   └── prompt.model.ts        # Model de prompt
├── guards/                # Guards globais
│   ├── auth.guard.ts          # Guard de autenticação (Firebase Token)
│   └── roles.guard.ts         # Guard de autorização por role
├── decorators/            # Decorators customizados
│   ├── public.decorator.ts    # @Public() - marca rotas públicas
│   └── roles.decorator.ts     # @Roles() - define roles necessárias
├── types/                 # Tipos compartilhados
│   ├── student.level.ts       # Type Level (A1, A2, B1, B2)
│   ├── student.info.ts        # Interface StudentInfo
│   └── student.supply.ts      # Schemas Zod (Module, Topic, Word, Music)
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

Retorna todos os usuários cadastrados.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

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

#### `POST /supplies`

Gera um novo material didático para um aluno em um nível específico.

| Propriedade | Valor |
|---|---|
| **Autenticação** | 🔒 Requerida |
| **Roles** | `teacher` |

**Request Body (`SupplyInfoDto`):**

```json
{
  "studentId": "550e8400-e29b-41d4-a716-446655440000",
  "level": "A1"
}
```

> O campo `level` aceita os valores: `A1`, `A2`, `B1`, `B2`

**Response (201) — `SupplyInfoDto`:**

```json
{
  "studentId": "550e8400-e29b-41d4-a716-446655440000",
  "level": "A1"
}
```

**Fluxo interno:**
1. Busca os dados do aluno (nome, objetivos, prognóstico)
2. Busca o prompt da IA correspondente ao nível
3. Monta o prompt completo com os dados do aluno
4. Envia para o **Google Gemini** e aguarda a resposta em JSON
5. Valida a resposta com **Zod** (`SupplyModulesSchema`)
6. Salva o supply no Firestore (coleção `student_supplies`, doc ID: `{studentId}_{level}`)

**Estrutura do conteúdo gerado (Modules):**

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
