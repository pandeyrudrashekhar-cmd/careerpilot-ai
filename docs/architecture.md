# CareerPilot AI — Architecture Documentation

## Three-Service Architecture

CareerPilot AI is designed as a **three-service monorepo** where each service is independently deployable and has a clear, single responsibility.

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                         │
│                   React + Vite Frontend                      │
│                    (localhost:5173)                          │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (REST API calls)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND SERVICE                           │
│              Node.js + Express + TypeScript                 │
│                    (localhost:3001)                          │
│  - REST API endpoints                                        │
│  - Auth & session management                                 │
│  - Business logic orchestration                              │
│  - Prisma ORM → PostgreSQL                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ Internal HTTP calls
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI SERVICE                               │
│             Python + FastAPI + LangChain                    │
│                    (localhost:8000)                          │
│  - Resume analysis                                           │
│  - Career roadmap generation                                 │
│  - Interview Q&A pipeline                                    │
│  - Skill gap detection                                       │
│  - Gemini API integration                                    │
│  - LangGraph workflow orchestration                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ Prisma Client / SQL
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE                               │
│              PostgreSQL via Supabase                         │
│  - User profiles                                             │
│  - Career session history                                    │
│  - Resume metadata                                           │
│  - pgvector embeddings (future phase)                       │
└─────────────────────────────────────────────────────────────┘
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
**Technology:** Node.js, Express.js, TypeScript, Prisma ORM, Zod

**Responsibilities:**
- Primary REST API for the frontend
- User authentication & session management (JWT / Clerk)
- Business logic orchestration
- Data persistence via Prisma + PostgreSQL
- Forwarding AI tasks to the AI service and returning results to frontend
- Request validation (Zod)
- Rate limiting and middleware

**Does NOT:**
- Perform LLM inference directly
- Handle complex AI workflow orchestration

---

### AI Service (`/ai-service`)
**Technology:** Python 3.14, FastAPI, Pydantic v2, LangChain, LangGraph, Google Gemini API

**Responsibilities:**
- All AI inference and LLM calls
- Resume parsing and analysis
- Career roadmap generation
- Interview preparation pipelines
- Skill gap detection
- Semantic search via pgvector embeddings (future)
- LangGraph multi-step agentic workflows

**Does NOT:**
- Handle user authentication
- Expose endpoints directly to the frontend
- Manage user data directly (receives structured data from backend)

---

## Data Flow Example: Resume Analysis

```
User uploads resume
      │
      ▼
Frontend (React)
  POST /api/resume/analyze
      │
      ▼
Backend (Express)
  1. Validate JWT
  2. Save resume metadata → Prisma → Supabase
  3. Extract text content
  4. POST http://ai-service:8000/analyze-resume
      │
      ▼
AI Service (FastAPI)
  1. Parse resume with Pydantic
  2. Build LangChain chain with Gemini
  3. Run analysis (skills, gaps, suggestions)
  4. Return structured JSON
      │
      ▼
Backend (Express)
  5. Receive AI results
  6. Save analysis → Prisma → Supabase
  7. Return enriched response to frontend
      │
      ▼
Frontend (React)
  TanStack Query cache updated
  Results rendered to user
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
│   │   ├── routes/         # Express route handlers
│   │   ├── middleware/      # Auth, validation, error handling
│   │   ├── services/        # Business logic
│   │   ├── prisma/          # Prisma schema & migrations
│   │   └── index.ts        # Server entry point
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   ├── tsconfig.json
│   └── package.json
│
├── ai-service/             # Python + FastAPI AI microservice
│   ├── app/
│   │   ├── routers/        # FastAPI route handlers
│   │   ├── services/        # LangChain chains, Gemini calls
│   │   ├── models/          # Pydantic request/response models
│   │   └── core/            # Config, logging, dependencies
│   ├── main.py             # FastAPI app entry point
│   ├── requirements.txt    # Python dependencies
│   └── .python-version     # Python version pin
│
└── docs/                   # Technical documentation
    └── architecture.md     # This document
```

---

## Environment Variables

See [../.env.example](../.env.example) for all required environment variables.

Each service reads from the shared root `.env` file (or its own `.env` in production).

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
