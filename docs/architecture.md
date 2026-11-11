# CareerPilot AI — Architecture Documentation

## Three-Service Architecture

CareerPilot AI is designed as a **three-service monorepo** where each service is independently deployable and has a clear, single responsibility.

```
┌───────────────────┐   HTTP    ┌──────────────────────┐  Prisma / SQL  ┌───────────────────┐
│ Browser           │ ────────► │ Backend              │ ─────────────► │ Supabase          │
│ React + Vite      │           │ Express + TypeScript │                │ PostgreSQL        │
│ localhost:5173    │           │ localhost:5000       │                │                   │
└───────────────────┘           └──────────┬───────────┘                └───────────────────┘
                                           │
                                           │ Authenticated server-to-server API
                                           ▼
                                ┌──────────────────────┐
                                │ AI Service           │
                                │ FastAPI, localhost:8000│
                                └──────────────────────┘

The current resume-analysis adapter calls Groq from the backend. The AI service
also uses a private database connection for pgvector retrieval. The backend remains
the only public API and supplies trusted, owner-scoped source data to the AI service.
```

---

## Service Responsibilities

### Frontend (`/frontend`)
**Technology:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query

**Responsibilities:**
- All user-facing UI components and pages
- Client-side routing (React Router v7)
- API communication via TanStack Query
- Form handling and validation
- Responsive, accessible design via shadcn/ui

**Does NOT:**
- Contain business logic
- Connect directly to the database
- Call the AI service directly (all requests go via backend)

---

### Backend (`/backend`)
**Technology:** Node.js, Express.js, TypeScript, Prisma ORM, PostgreSQL, Zod

**Responsibilities:**
- Primary REST API for the frontend
- Supabase Auth JWT verification and user provisioning
- Business logic orchestration
- Data persistence via Prisma + PostgreSQL
- Resume metadata persistence and ownership enforcement
- Structured resume analysis through a server-side Groq provider (optional)
- Owner-scoped knowledge-source collection and conversation/message persistence
- Server-to-server AI service orchestration with a private shared token
- Request validation (Zod)
- Rate limiting and middleware

**Does NOT:**
- Handle complex AI workflow orchestration

Resume analysis remains a backend-side Groq adapter. The FastAPI AI service now provides private RAG and Copilot inference; neither integration fabricates output when provider configuration is absent.

---

### AI Service (`/ai-service`)
**Technology:** Python 3.14, FastAPI, Pydantic v2, Groq API, PostgreSQL/pgvector

**Responsibilities:**
- Embedding generation and document chunking
- User-filtered pgvector retrieval
- Grounded Copilot inference and source references
- Bounded conversation-history orchestration

**Does NOT:**
- Verify end-user Supabase JWTs or make ownership decisions
- Expose privileged endpoints directly to the frontend
- Execute business-data mutations

The AI service accepts only backend-to-service requests protected by a shared
`AI_SERVICE_INTERNAL_TOKEN`. It stores derived chunks keyed by the trusted user UUID
provided by Express; every vector search filters on that UUID in SQL.

---

## Data Flow Example: Resume Analysis

```
User uploads PDF/DOCX resume
      │
      ▼
Frontend (React)
  POST /api/resumes
      │
      ▼
Backend (Express)
  1. Verify Supabase JWT; derive user UUID from `sub`
  2. Validate file and upload to private Supabase Storage
  3. Save owner-scoped metadata → Prisma → Supabase PostgreSQL
      │
      ▼
POST /api/resumes/:resumeId/analyze
      │
      ▼
Backend (Express)
  1. Re-check ownership and download using user JWT
  2. Extract PDF/DOCX text
  3. Request structured output from configured Groq provider
  4. Validate with Zod; persist analysis and processing status
      │
      ▼
Frontend (React)
  Receives structured analysis; provider secrets stay server-side
```

---

## Directory Structure

```
careerpilot-ai/
│
├── .git/                   # Git repository
├── .gitignore              # Root gitignore (all services)
├── .env.example            # Environment variable template
├── README.md               # Project overview
│
├── frontend/               # React + Vite application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route-level page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility functions, API clients
│   │   ├── types/          # TypeScript type definitions
│   │   └── main.tsx        # App entry point
│   ├── public/             # Static assets
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                # Express + TypeScript API server
│   ├── src/
│   │   ├── config/         # Validated environment configuration
│   │   ├── controllers/    # HTTP request and response handling
│   │   ├── middleware/     # Error and not-found handling
│   │   ├── routes/         # Express route handlers
│   │   ├── services/       # Business logic
│   │   ├── lib/            # Shared infrastructure clients (Prisma)
│   │   ├── utils/          # Shared utilities and API errors
│   │   ├── validation/     # Zod request and AI response schemas
│   │   ├── types/          # Express request context types
│   │   ├── app.ts          # Express application configuration
│   │   └── index.ts        # Server entry point
│   ├── tests/              # Backend unit and integration tests
│   ├── prisma/
│   │   └── schema.prisma   # PostgreSQL datasource and Prisma client generator
│   │       migrations/     # Versioned database migrations
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
├── ai-service/             # Python + FastAPI AI microservice
│   ├── app/
│   │   ├── routers/        # FastAPI route handlers
│   │   ├── services/        # Chunking, embeddings, retrieval, and RAG orchestration
│   │   ├── models/          # Pydantic request/response models
│   │   └── core/            # Config, internal auth, shared dependencies
│   ├── main.py             # FastAPI app entry point
│   ├── tests/              # AI-service unit tests with mocked providers/storage
│   ├── .env.example
│   ├── requirements.txt    # Python dependencies
│   └── .python-version     # Python version pin
│
└── docs/                   # Technical documentation
    └── architecture.md     # This document
```

---

## Environment Variables

See [../.env.example](../.env.example) for frontend-only variables, [../backend/.env.example](../backend/.env.example) for backend configuration, and [../ai-service/.env.example](../ai-service/.env.example) for the private AI-service configuration.

The backend validates `NODE_ENV`, `PORT`, `FRONTEND_URL`, and `AI_SERVICE_URL` at startup. Local development defaults to port `5000`, frontend origin `http://localhost:5173`, and AI service URL `http://localhost:8000`. Production requires an explicit HTTPS AI-service URL and internal token. Prisma reads `DATABASE_URL` (Supabase transaction pooler) and `DIRECT_URL` (Supabase session pooler) from `backend/.env`; the AI service uses a separate private `DATABASE_URL`.

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `backend/.env` for Auth JWKS verification and user-scoped Storage requests. The Auth verifier accepts asymmetric ES256/RS256 JWTs issued for the `authenticated` audience by that project. Create a private bucket named by `SUPABASE_RESUME_BUCKET` (default `resumes`) and configure Storage policies to allow an authenticated user to access only object paths under their JWT subject UUID. Storage access uses the user's verified access token with the anon/publishable key; the service-role key is neither required nor used. Never expose database, AI-provider, or Supabase service-role credentials to the frontend.

`GROQ_API_KEY` configures the optional resume-analysis and interview-generation/evaluation providers; `GROQ_MODEL` defaults to `openai/gpt-oss-20b`. If the key is absent, AI-backed endpoints return an explicit service-unavailable error rather than fabricated output. `RESUME_MAX_SIZE_BYTES` defaults to 10 MiB and is capped at 50 MiB.

Set `GROQ_API_KEY` in both private services and the same random value of at least 32 characters for `AI_SERVICE_INTERNAL_TOKEN`. The AI service also requires server-side `DATABASE_URL`; `GROQ_MODEL` defaults to `openai/gpt-oss-20b`. Embeddings use the pinned local ONNX artifact for `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions), cached under `LOCAL_EMBEDDING_CACHE_DIR` or `~/.cache/careerpilot-ai/minilm-onnx`. The selected quantized artifact requires AVX2. Missing configuration returns explicit errors. Never place these variables in the frontend's Vite environment.

### Backend API

All profile and resume endpoints require an `Authorization` bearer token containing a Supabase access token. Authentication provisions/updates the public `User` row and profile using the verified JWT subject; owner IDs in request data are never trusted.

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | API welcome |
| GET | `/api/health` | Health check |
| GET | `/api/profile` | Get or provision the caller's profile |
| PATCH | `/api/profile` | Validate and update the caller's profile |
| POST | `/api/resumes` | Upload one `file` in multipart form (PDF or DOCX) |
| GET | `/api/resumes` | List caller-owned resume metadata |
| GET | `/api/resumes/:resumeId` | Get owned resume and analysis details |
| PUT | `/api/resumes/:resumeId/active` | Select active owned resume |
| POST | `/api/resumes/:resumeId/analyze` | Extract and analyze an owned resume |
| DELETE | `/api/resumes/:resumeId` | Delete owned resume metadata and private Storage object |
| GET | `/api/jobs` | Search manually stored jobs with filters and pagination |
| GET | `/api/jobs/search` | Search local jobs or a configured external provider |
| GET | `/api/jobs/:id` | Get a job |
| POST | `/api/jobs` | Create a manual job |
| POST | `/api/jobs/:id/match` | Calculate and persist a compatibility match |
| GET | `/api/jobs/:id/match` | Get the caller's latest match for a job |
| GET | `/api/matches` | List the caller's match history |
| POST | `/api/roadmaps/generate` | Generate a roadmap from an active resume and job |
| GET | `/api/roadmaps` | List the caller's roadmaps |
| GET | `/api/roadmaps/:id` | Get an owned roadmap and ordered items |
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
| POST | `/api/interviews/:id/start` | Confirm an in-progress session |
| POST | `/api/interviews/:id/questions` | Generate questions using AI or labeled deterministic fallback |
| POST | `/api/interviews/:id/questions/manual` | Add a manually authored question |
| GET | `/api/interviews/:id/questions` | List questions without answer keys |
| POST | `/api/interviews/:id/answers` | Submit or replace an answer |
| POST | `/api/interviews/:id/answers/:questionId/evaluate` | Evaluate a submitted answer with configured AI |
| GET | `/api/interviews/:id/feedback` | Retrieve answer feedback and evaluation state |
| POST | `/api/interviews/:id/complete` | Complete a session and summarize evaluated answers |
| POST | `/api/knowledge/ingest` | Index the caller's current authorized career-data snapshot |
| POST | `/api/knowledge/reindex` | Replace indexed knowledge from current source records |
| GET | `/api/knowledge/status` | Get caller-owned source and chunk counts |
| DELETE | `/api/knowledge/:sourceType/:sourceId` | Remove a caller-owned indexed source |
| POST | `/api/copilot/conversations` | Create an owned conversation |
| GET | `/api/copilot/conversations` | List owned conversations with pagination |
| GET | `/api/copilot/conversations/:id` | Retrieve recent messages |
| POST | `/api/copilot/conversations/:id/messages` | Persist a message and return a grounded reply with sources |
| DELETE | `/api/copilot/conversations/:id` | Delete an owned conversation |

Profile writes accept only documented profile fields and reject extra fields. Resume upload validates extension, MIME type, file signature, and size; generated object paths are rooted at the verified user UUID. Resume binaries are stored in private Supabase Storage, never PostgreSQL.

Job records are shared discovery records rather than user-owned entities; creation is still authenticated. Manual jobs store normalized required and optional skill names. External provider discovery uses a provider interface, but no provider is registered or connected; requesting one currently returns HTTP 501. No web scraping is performed. Duplicate imported jobs are rejected by the database's `(provider, externalId)` unique constraint.

The matching engine compares the active resume's latest completed extracted-skill analysis against normalized job skills. It assigns an explainable product-defined score: required coverage is the full score without optional criteria; where optional skills exist, required coverage is weighted 80% and optional overlap 20%. Missing and matched required skills are persisted with the match. The score is not an ATS score or hiring probability, and no LLM or unsupported experience inference is involved.

Roadmap generation is deterministic and currently uses the selected job's required skills, the active resume analysis, and recorded `UserSkill` proficiency. Beginner/elementary profile skills are marked partial; higher recorded levels or resume-extracted skills count as existing. Missing/partial skill items receive high/medium priority respectively. No effort estimate or resource URL is invented. `generationSource` records `DETERMINISTIC`; `AI` is reserved for a future provider implementation. Roadmap changes are transactionally owner-scoped, validated against allowed item-status transitions, and synchronize the roadmap completion state.

### Application tracking and interview practice

Application records can reference a shared job or store a manually entered company/role, and can optionally reference only a resume owned by the caller. Application statuses use the schema's actual enum (`SAVED`, `APPLIED`, `SCREENING`, `INTERVIEW`, `OFFER`, `REJECTED`, `WITHDRAWN`). Creation and each status transition append history transactionally. Duplicate applications for the same linked job are rejected. Lists are paginated and can filter status, company, role, and inclusive date range; no follow-up date is stored because the schema has no such field. Dashboard totals and recent records are always scoped by authenticated owner.

Interview sessions use the existing `TECHNICAL`, `BEHAVIORAL`, `SYSTEM_DESIGN`, `HR`, `MIXED`, `OTHER` types and `BEGINNER`, `INTERMEDIATE`, `ADVANCED` difficulties. Sessions can optionally link a shared job and an owner-verified resume. Questions can be added manually or generated. With `GROQ_API_KEY`, strict structured outputs are validated with Zod; the interview provider uses the configured backend Groq model. Without a key, generation returns an explicit configuration error rather than generated demo content; evaluation is likewise never fabricated. Submitting an answer does not evaluate it; evaluation is a separate endpoint. Question retrieval does not expose stored expected answers. Completion averages evaluated answers only and leaves unanswered/unevaluated answers out of the denominator. Statistics are owner-scoped, with trends shown only when at least three evaluated scores exist.

Batch 6 adds `jobId` and `resumeId` optional relations to `InterviewSession` with `SET NULL` deletion behavior. The project context reports migrations `0001` through `0003` as applied.

### Batch 7: RAG knowledge and Career Copilot

The authenticated Express API owns source selection and conversation persistence. `POST /api/knowledge/ingest` and `/reindex` assemble a complete snapshot from the caller's active resume's latest completed analysis, profile, recorded skills, non-archived roadmaps, applications, and jobs referenced by that user's applications or job matches. No global job catalog or other user's data is indexed. Repeated ingestion replaces the caller's prior vector set; the AI service reuses embeddings for matching content hashes and clears old chunks when a source disappears. `GET /api/knowledge/status` reports the owner-specific indexed source/chunk counts, and `DELETE /api/knowledge/:sourceType/:sourceId` removes only matching owner/source chunks.

The AI service normalizes and tokenizer-chunks source text to at most 224 wordpieces including special tokens. It uses the pinned ONNX `model_quint8_avx2.onnx` artifact at revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41` for normalized 384-dimensional embeddings, and stores new vectors in `KnowledgeChunkLocal`. Ingestion reuse and retrieval use this same embedding model. Similarity search applies `userId = supplied_user_uuid` inside its parameterized SQL query before ranking and applies top-K and similarity thresholds. Source IDs, titles, and chunk indexes accompany retrieved context. Groq provides chat generation.

`POST /api/copilot/conversations`, `GET /api/copilot/conversations`, `GET /api/copilot/conversations/:id`, `POST /api/copilot/conversations/:id/messages`, and `DELETE /api/copilot/conversations/:id` provide the conversation lifecycle. Express derives owner identity solely from Supabase JWT verification, checks ownership before reads/writes, bounds history, stores user/assistant messages, and persists returned source references. Groq receives a bounded prompt in which retrieved material and history are untrusted content, not instructions. With no relevant retrieval, the model is instructed to state that personal career data is insufficient and distinguish general guidance. AI output is schema validated; model citations are limited to retrieved sources.

Express authenticates to the private FastAPI `/internal/v1/` API using the server-only `AI_SERVICE_INTERNAL_TOKEN`. The AI service never verifies frontend identity or performs career-data mutations. Configure the same random token and `GROQ_API_KEY` in backend and AI-service environments, plus AI-service `DATABASE_URL` and `LOCAL_EMBEDDING_CACHE_DIR` as needed. `GROQ_MODEL` defaults to `openai/gpt-oss-20b`. The frontend calls Express only.

The additive migration `backend/prisma/migrations/0004_copilot_knowledge_vectors/migration.sql` creates the legacy `KnowledgeChunk` table with 1536-dimensional vectors. Phase 3B adds `backend/prisma/migrations/0005_local_embedding_vectors/migration.sql`, which creates a separate owner-keyed 384-dimensional `KnowledgeChunkLocal` table, indexes, and RLS/revoke protections. The new migration does not alter, truncate, overwrite, or delete legacy embeddings. Neither migration is applied by this implementation; production migration and re-indexing require separate approval.

## Database Module and Data Model

The Prisma schema in `backend/prisma/schema.prisma` defines the application data model. The vector table is intentionally managed by raw additive SQL because Prisma does not represent pgvector columns. The reusable Prisma client is in `backend/src/lib/prisma.ts`. The initial schema migration is stored in `backend/prisma/migrations/0001_init/migration.sql`.

### Entities and relationships

- **Identity:** `User` has a one-to-one `Profile`. `User.id` is a UUID supplied from the verified Supabase Auth identity; it deliberately has no generated default. The public `User` row is not a Prisma relation to `auth.users`: that Supabase-managed schema is outside this Prisma datasource.
- **Skills:** `UserSkill` joins users and normalized `Skill` records, storing proficiency, experience, and evidence source.
- **Resume intelligence:** A user owns multiple `Resume` records; each resume can have multiple `ResumeAnalysis` snapshots. Resume rows store private Storage object metadata only—the binary is not stored in PostgreSQL.
- **Job intelligence:** `Job` records can be provider-sourced or manual. `JobMatch` belongs to a user, resume, and job and stores a product-defined compatibility score and skill comparison, not an ATS score or hiring probability.
- **Learning:** A user owns `LearningRoadmap` records, optionally linked to a source resume; each roadmap contains ordered `RoadmapItem` records.
- **Applications:** A user owns `Application` records, optionally linked to a job and resume. Each application has append-only `ApplicationStatusHistory` events. Status changes must update the application and insert the corresponding history event in one database transaction.
- **Interview preparation:** A user owns `InterviewSession` records; sessions contain ordered questions, each with an optional answer and evaluation.
- **AI Copilot:** A user owns `Conversation` records; each contains messages ordered by a per-conversation sequence. Message metadata stores provider/model and source references. Raw SQL-managed `KnowledgeChunk` rows retain legacy 1536-dimensional embeddings; `KnowledgeChunkLocal` stores new 384-dimensional embeddings. Both are user-keyed and accessed using owner-filtered SQL.

### Supabase Auth, ownership, and RLS

Supabase Auth remains the credential authority. Express verifies the JWT against the project's JWKS and derives the trusted user UUID from its `sub` claim; clients cannot choose an owner ID. The middleware provisions the matching public user/profile, and services scope access to that verified user. The AI service is reachable only through a backend shared token; its user ID is trusted only because Express supplies it after JWT verification. All vector queries include the supplied owner in SQL. Prisma foreign keys do not enforce Supabase Row Level Security; ordinary Prisma-managed application tables still rely on API ownership checks, while the SQL-managed `KnowledgeChunk` table enables RLS and revokes direct `anon`/`authenticated` access. Never expose a service-role credential or internal token to the frontend.

Top-level user-owned records use restrictive foreign keys so deleting a user cannot silently cascade away career history. Cascades are limited to dependent data such as resume analyses, roadmap items, interview questions/answers, and conversation messages. Deletion and retention workflows still need explicit product policy.

### Resume storage and schema-level limitations

Resume objects are stored in a private Supabase Storage bucket. PostgreSQL stores the bucket/path, file metadata, processing state, and checksum only. Backend Storage requests carry the verified user's JWT and use a user-UUID-scoped object path; Storage RLS must enforce that path ownership. The backend validates file size, extension, MIME type, and file signature before upload and supports PDF and DOCX text extraction. Analysis output is Zod-validated before it is persisted. Cross-system deletion cannot be atomic; if Storage cleanup fails after metadata deletion, the API reports the failure and the orphaned private object requires cleanup.

The `(provider, externalId)` unique constraint deduplicates sourced jobs when both values are present; service validation must require both for `EXTERNAL_PROVIDER` jobs and leave them null for manual jobs. PostgreSQL permits multiple null values in this unique constraint.

The schema indexes `(userId, isActive)` but Prisma's schema language cannot express a PostgreSQL partial unique index for “at most one active resume per user”; resume activation must be serialized/validated by the service until an explicitly reviewed SQL migration adds that constraint. Likewise, enforce numeric ranges (for example 0–100 match scores and non-negative experience/effort values) and same-owner consistency for a match's user/resume in backend validation or reviewed database constraints. The job-match implementation bounds scores to 0–100 by construction. Append application status events atomically with status changes.

Batch 5 schema changes are additive and located in `backend/prisma/migrations/0002_job_skills_and_roadmap_source/migration.sql`. This migration adds job skill arrays and the roadmap generation-source enum/column and is reported as applied.

The RAG vector table is not represented in Prisma because the generated Prisma client does not support the pgvector type. The SQL migration owns its extension, table, and indexes; review/apply it separately, then configure the AI service's private database connection before using ingestion or Copilot endpoints.

---

## Deployment Strategy (Future)

| Service | Platform | Notes |
|---|---|---|
| Frontend | Vercel | Auto-deploy from `main` branch |
| Backend | Railway / Render | Node.js Docker container |
| AI Service | Railway / Render | Python Docker container |
| Database | Supabase | Managed PostgreSQL |

---

*Document version: 0.1.0 — Phase 0 (Scaffold)*
