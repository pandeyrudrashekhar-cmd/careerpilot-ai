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
├── ai-service/      # Python + FastAPI + LangChain + Gemini API
└── docs/            # Architecture and technical documentation
```

| Service | Technology | Port | Purpose |
|---|---|---|---|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui | 5173 | User interface |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM | 3001 | REST API, auth, data layer |
| **AI Service** | Python, FastAPI, LangChain, LangGraph, Gemini | 8000 | AI inference & pipelines |

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
- **LangChain + LangGraph** — AI workflow orchestration
- **Google Gemini API** — large language model inference
- **pgvector** (future) — vector similarity search for semantic features

### Database
- **PostgreSQL** (hosted on Supabase)
- **pgvector** extension for vector embeddings (future phase)

---

## Project Status

| Phase | Status | Description |
|---|---|---|
| Phase 0 — Scaffold | ✅ Complete | Monorepo initialized, all services scaffolded |
| Phase 1 — Core UI | 🔜 Next | Layout, routing, component library |
| Phase 2 — Backend API | 🔜 Planned | Express server, Prisma schema, REST endpoints |
| Phase 3 — AI Service | 🔜 Planned | FastAPI setup, Gemini integration, LangChain chains |
| Phase 4 — Integration | 🔜 Planned | End-to-end data flow across all three services |
| Phase 5 — Auth & DB | 🔜 Planned | Supabase auth, user profiles, data persistence |

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

### 3. Backend (future)

```bash
cd backend
npm install
npm run dev
# → http://localhost:3001
```

### 4. AI Service (future)

```bash
cd ai-service
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# → http://localhost:8000
```

### 5. Environment Setup

```bash
cp .env.example .env
# Edit .env with your real API keys
```

---

## Documentation

- [Architecture Overview](docs/architecture.md)

---

## License

MIT — Built for 2027 Software Engineering Placement Portfolio.
