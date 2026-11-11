# CareerPilot AI 🚀

> **Premium AI-powered career guidance platform for software engineering placements.**

CareerPilot AI helps software engineering students and early-career developers navigate their placement journey with personalised AI guidance — from resume analysis and skill-gap detection to interview preparation and career roadmap generation.

---

## Architecture Overview

CareerPilot AI is a **three-service monorepo**:

```
careerpilot-ai/
├── frontend/        # React + TypeScript + Vite + Tailwind CSS
├── backend/         # Node.js + Express + TypeScript + Prisma ORM
├── ai-service/      # Python + FastAPI + Groq RAG and Copilot orchestration
└── docs/            # Architecture and technical documentation
```

| Service | Technology | Port | Purpose |
|---|---|---|---|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui | 5173 | User interface |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM | 5000 | REST API, Supabase Auth, profiles, resumes |
| **AI Service** | Python 3.14, FastAPI, Pydantic, Groq, pgvector | 8000 | Private RAG and Copilot inference |

---

## Tech Stack

### Frontend
- **React 19** + **TypeScript** — component framework
- **Vite** — blazing-fast dev server and bundler
- **Tailwind CSS** — utility-first styling
- **shadcn/ui** — accessible, composable UI components
- **React Router v7** — client-side routing
- **TanStack Query** — async state management and API caching

### Backend
- **Node.js** + **Express.js** + **TypeScript** — REST API server
- **Prisma ORM** — type-safe database access
- **PostgreSQL** via **Supabase** — primary database
- **Zod** — runtime request validation

### AI Service
- **Python 3.14** + **FastAPI** — high-performance async AI endpoint server
- **Pydantic v2** — request/response validation
- **ONNX Runtime** — pinned local 384-dimensional CPU embeddings
- **Groq API** — Copilot chat, resume analysis, and interview generation/evaluation
- **pgvector** — user-scoped semantic retrieval in Supabase PostgreSQL

### Database
- **PostgreSQL** (hosted on Supabase)
- **pgvector** extension for user-scoped knowledge embeddings (Batch 7 migration pending)

---

## Project Status

| Phase | Status | Description |
|---|---|---|
| Phase 0 — Scaffold | ✅ Complete | Monorepo initialized, all services scaffolded |
| Phase 1 — Core UI | ✅ Foundation | React UI, routing, component library |
| Phase 2 — Backend API | ✅ Foundation | Express server, Prisma schema, initial migration |
| Batch 3/4 — Auth & resumes | ✅ Foundation | Supabase JWT verification, profiles, private Storage resume APIs |
| Phase 3 — AI Service | ✅ Foundation | Internal FastAPI service, embeddings, retrieval, and grounded Copilot API |
| Phase 4 — Integration | 🟡 In progress | Backend APIs are wired to the private AI service; live credentials/migration required |
| Phase 5 — Career modules | ✅ Foundation | Job, roadmap, application, interview, and Copilot APIs |

---

## Getting Started

### Prerequisites
- Node.js v20+ (current: v24.16.0)
- Python 3.11+ (current: 3.14.7)
- npm v10+ (current: 11.13.0)
- Git

### 1. Clone & Install

```bash
git clone <repo-url>
cd careerpilot-ai
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 3. Backend

Create `backend/.env` from the backend template, then fill in the values locally. Do not commit this file.

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
# → http://localhost:5000
```

Configure `DATABASE_URL` (Supabase transaction pooler), `DIRECT_URL` (session pooler), `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Create a **private** Supabase Storage bucket matching `SUPABASE_RESUME_BUCKET` (`resumes` by default), with Storage policies restricted to the authenticated user's UUID folder. The initial database migration is tracked under `backend/prisma/migrations`.

Protected API calls require `Authorization: Bearer <Supabase access token>`. Resume analysis and interview evaluation use the server-side Groq key; without it, these features return an explicit configuration error. Never expose database credentials, AI keys, or Supabase service-role credentials to the frontend.

Set `GROQ_API_KEY` in both `backend/.env` and `ai-service/.env` and optionally set `GROQ_MODEL` (defaults to `openai/gpt-oss-20b`). These values are server-side only; never use Vite-prefixed variables or expose them to the frontend. Set `AI_SERVICE_URL` and the same random `AI_SERVICE_INTERNAL_TOKEN` in both service environments. The FastAPI service additionally needs its own `DATABASE_URL` and local ONNX model cache configuration; the pinned model files are downloaded lazily to `LOCAL_EMBEDDING_CACHE_DIR` (default `~/.cache/careerpilot-ai/minilm-onnx`). The frontend calls only the Express API.

#### Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | API welcome |
| GET | `/api/health` | Health check |
| GET | `/api/profile` | Get or provision the authenticated user's profile |
| PATCH | `/api/profile` | Update the authenticated user's profile |
| POST | `/api/resumes` | Upload one PDF/DOCX resume (`multipart/form-data`, field `file`) |
| GET | `/api/resumes` | List the authenticated user's resumes |
| GET | `/api/resumes/:resumeId` | Get resume metadata and analyses |
| PUT | `/api/resumes/:resumeId/active` | Select the active resume |
| POST | `/api/resumes/:resumeId/analyze` | Extract text and request structured AI analysis |
| DELETE | `/api/resumes/:resumeId` | Delete owned resume metadata and Storage object |
| GET | `/api/jobs` | Search manually stored jobs with filters and pagination |
| GET | `/api/jobs/search` | Search local jobs or request a configured external provider |
| GET | `/api/jobs/:id` | Get a job |
| POST | `/api/jobs` | Create a manual job with normalized skill criteria |
| POST | `/api/jobs/:id/match` | Calculate and persist a deterministic compatibility match |
| GET | `/api/jobs/:id/match` | Get the caller's latest match for a job |
| GET | `/api/matches` | List the caller's paginated match history |
| POST | `/api/roadmaps/generate` | Generate a deterministic roadmap from the active resume analysis and job |
| GET | `/api/roadmaps` | List the caller's roadmaps |
| GET | `/api/roadmaps/:id` | Get an owned roadmap and its ordered items |
| PATCH | `/api/roadmaps/:id/items/:itemId` | Update an owned roadmap item's status |
| POST | `/api/applications` | Add a linked job or manual application |
| GET | `/api/applications` | List applications with status/company/role/date filters and pagination |
| GET | `/api/applications/stats` | Get owner-scoped status totals and recent applications |
| GET | `/api/applications/:id` | Get application details |
| PATCH | `/api/applications/:id` | Update company, role, applied date, or notes |
| PATCH | `/api/applications/:id/status` | Change status and append status history atomically |
| GET | `/api/applications/:id/history` | Get application status history |
| DELETE | `/api/applications/:id` | Delete application and its history |
| POST | `/api/interviews` | Create an interview session with optional job/resume references |
| GET | `/api/interviews` | List sessions with filters and pagination |
| GET | `/api/interviews/stats` | Get session and evaluated-answer performance statistics |
| GET | `/api/interviews/:id` | Get session and question progress |
| POST | `/api/interviews/:id/start` | Confirm/start an in-progress session |
| POST | `/api/interviews/:id/questions` | Generate questions with Groq; returns an explicit configuration/provider error when unavailable |
| POST | `/api/interviews/:id/questions/manual` | Add a manually authored question |
| GET | `/api/interviews/:id/questions` | List questions without answer keys |
| POST | `/api/interviews/:id/answers` | Submit or replace an answer |
| POST | `/api/interviews/:id/answers/:questionId/evaluate` | Evaluate a submitted answer with configured AI |
| GET | `/api/interviews/:id/feedback` | Retrieve answer feedback and evaluation state |
| POST | `/api/interviews/:id/complete` | Complete a session and summarize evaluated answers |
| POST | `/api/knowledge/ingest` | Build and replace the caller's indexed career-data snapshot |
| POST | `/api/knowledge/reindex` | Re-index current authorized profile, resume, skills, roadmaps, applications, and related jobs |
| GET | `/api/knowledge/status` | Get the caller's indexed source and chunk counts |
| DELETE | `/api/knowledge/:sourceType/:sourceId` | Delete a caller-owned indexed source |
| POST | `/api/copilot/conversations` | Create an owned Copilot conversation |
| GET | `/api/copilot/conversations` | List owned conversations with pagination |
| GET | `/api/copilot/conversations/:id` | Get recent conversation history |
| POST | `/api/copilot/conversations/:id/messages` | Save a message and request a grounded Copilot response |
| DELETE | `/api/copilot/conversations/:id` | Delete an owned conversation and its messages |

Knowledge routes require no client-supplied user ID; ingest/reindex build a complete snapshot for the verified caller. Valid `sourceType` values are `RESUME`, `PROFILE`, `SKILL`, `ROADMAP`, `APPLICATION`, and `JOB`. Create conversations with `{ "title": "Optional title" }`; send messages with `{ "content": "What should I improve for a backend role?" }`. Successful responses use the standard `{ "success": true, "data": ... }` envelope. Conversation history is bounded to recent messages, and AI responses include source metadata rather than exposing indexed chunk text.

Knowledge ingestion gathers only records scoped to the verified user. Resume content comes from the active resume's latest completed analysis; jobs are included only when referenced by that user's applications or matches. Re-ingestion is a full snapshot replacement in the new local-vector table, so deleted or changed sources are removed on the next ingest/reindex. New embeddings use the pinned `sentence-transformers/all-MiniLM-L6-v2` ONNX model and are normalized to 384 dimensions; tokenizer-aware chunks are limited to 224 wordpieces including special tokens. Retrieval uses that same model and filters by `userId` in the parameterized pgvector query. Copilot chat uses Groq, citations remain tied to retrieved sources, and retrieved text is treated as untrusted input.

Batch 7 adds `backend/prisma/migrations/0004_copilot_knowledge_vectors/migration.sql`, which creates the legacy 1536-dimensional `KnowledgeChunk` table. Phase 3B adds `backend/prisma/migrations/0005_local_embedding_vectors/migration.sql` with a separate 384-dimensional `KnowledgeChunkLocal` table and owner-scoped indexes, RLS, and grants revocation. The new migration is additive and leaves the legacy table and its vectors untouched. **Do not apply either migration or run production re-indexing until approved.** Missing local model, provider, or database configuration returns an explicit error rather than fake embeddings or answers. Render compatibility has not been established.

Resume uploads default to a 10 MiB limit (`RESUME_MAX_SIZE_BYTES`), accept matching PDF/DOCX extension and MIME types, and are stored in the private Storage bucket rather than PostgreSQL.

Job matches are product-defined compatibility scores, not official ATS scores or hiring probabilities. Required-skill coverage contributes 100% of the score if there are no optional skills; otherwise required coverage is weighted 80% and optional-skill overlap 20%. The current roadmap generator is deterministic, labels saved roadmaps `DETERMINISTIC`, and intentionally supplies no unverified resource links or effort estimates. External job providers are an interface only; no provider credentials or integrations are configured.

The Batch 5 additive schema update is in `backend/prisma/migrations/0002_job_skills_and_roadmap_source/migration.sql` and is reported as applied.

Application status values follow the Prisma enum (`SAVED`, `APPLIED`, `SCREENING`, `INTERVIEW`, `OFFER`, `REJECTED`, `WITHDRAWN`). Status history is written in the same transaction as status changes. Duplicate linked-job applications are rejected; manual applications require company and role. Date filters use `from`/`to` in `YYYY-MM-DD` form. No follow-up date is stored because the current model has no such field.

Interview type/difficulty use Prisma enum values (`TECHNICAL`, `BEHAVIORAL`, `SYSTEM_DESIGN`, `HR`, `MIXED`, `OTHER`; and `BEGINNER`, `INTERMEDIATE`, `ADVANCED`). Question-generation requests accept `{ "count": 5, "skills": ["TypeScript"] }`; answers accept `{ "questionId": "<uuid>", "content": "..." }`. Submission does not imply evaluation. Generation and evaluation require configured Groq; missing configuration, provider failures, and malformed AI output return explicit errors rather than generated demo content. Questions may be added manually. Unanswered questions are excluded from completion averages.

Batch 6 adds optional interview job/resume references. Its additive migration is `backend/prisma/migrations/0003_interview_job_resume_relations/migration.sql`; Prisma reports migrations `0001` through `0003` as applied.

### 4. AI Service

```bash
cd ai-service
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --port 8000
# → http://localhost:8000
```

Configure both private service `.env` files with `GROQ_API_KEY` and, optionally, `GROQ_MODEL` (`openai/gpt-oss-20b`). Configure the AI service with `AI_SERVICE_INTERNAL_TOKEN`, its server-side Postgres `DATABASE_URL`, and `LOCAL_EMBEDDING_CACHE_DIR`. Local embedding uses the pinned `sentence-transformers/all-MiniLM-L6-v2` ONNX artifact on CPU and requires an AVX2-capable host. Never use `VITE_` prefixes for secrets or expose the internal API to browsers. The internal token is shared with the backend and is checked before all `/internal/v1/` operations.

See [docs/deployment.md](docs/deployment.md) for the Vercel/Render/Supabase setup, required environment variables, health checks, model caching, and unverified Linux/free-tier constraints. Deployment is not performed automatically.

####CE_ID_B"
    ) | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
}
if ($null -ne $testExitCode) { exit $testExitCode }
```

Ordinary AI-service tests do not opt in to remote access and skip this integration test. Opt-in live ONNX/pgvector integration test

`tests/test_local_embedding_integration.py` exercises the production local embedding, ingestion, and user-filtered retrieval code against Supabase. It never invokes remote chat generation or remote embeddings. The test is disabled unless `CAREERPILOT_ONNX_REMOTE_TEST=1` is set and requires an explicit test database URL; it never falls back to the AI service or backend `.env` database configuration.

The test is hard-bound to the approved disposable project reference and the two dedicated user/source ID pairs documented below. Before writing, it verifies both users exist and have no rows in `KnowledgeChunkLocal`, and that neither source ID is already in use. Ingestion uses the existing user-wide snapshot replacement function, so do not repurpose these users for real CareerPilot data. Its `finally` block attempts exact `(userId, sourceType, sourceId)` deletion for both test sources and verifies those pairs are empty; it never deletes a user or an entire snapshot. Do not run this test against production users.

In PowerShell, run from the repository root. Enter the dedicated Supabase database URL at the secure prompt; the commands remove the transient environment variables even if pytest fails:

```powershell
$secureDsn = Read-Host "Dedicated Supabase test database URL" -AsSecureString
$dsnPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDsn)
try {
    $env:CAREERPILOT_TEST_DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($dsnPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($dsnPointer)
    $secureDsn.Dispose()
}
$env:CAREERPILOT_ONNX_REMOTE_TEST = "1"
$env:CAREERPILOT_EXPECTED_SUPABASE_PROJECT_REF = "clhexcvomguhmnjjxhoo"
$env:CAREERPILOT_TEST_USER_ID_A = "29c6e5ba-3239-4654-9ff2-81860fbc608d"
$env:CAREERPILOT_TEST_USER_ID_B = "81123065-cfdd-437e-9475-bba75167878b"
$env:CAREERPILOT_TEST_SOURCE_ID_A = "5b3312fd-7cb5-4890-b1f9-97abefe2396b"
$env:CAREERPILOT_TEST_SOURCE_ID_B = "59e057e3-63f5-4b99-a493-75cfd8c2f6d3"
try {
    Push-Location ai-service
    .\venv\Scripts\python.exe -m pytest tests\test_local_embedding_integration.py -q -s
    $testExitCode = $LASTEXITCODE
    Pop-Location
} finally {
    @(
        "CAREERPILOT_TEST_DATABASE_URL",
        "CAREERPILOT_ONNX_REMOTE_TEST",
        "CAREERPILOT_EXPECTED_SUPABASE_PROJECT_REF",
        "CAREERPILOT_TEST_USER_ID_A",
        "CAREERPILOT_TEST_USER_ID_B",
        "CAREERPILOT_TEST_SOURCE_ID_A",
        "CAREERPILOT_TEST_SOUR

### 5. Frontend Environment Setup

```powershell
Copy-Item .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the same project as backend/.env.
# The anon key is public; never put service-role keys or other secrets in VITE_ variables.
```

---

## Documentation

- [Architecture Overview](docs/architecture.md)

---

## License

MIT — Built for 2027 Software Engineering Placement Portfolio.
