"""
CareerPilot AI — FastAPI AI Service Entry Point
Phase 0: Scaffold only. Business logic to be implemented in Phase 3.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ─── App Instance ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="CareerPilot AI Service",
    description="AI inference service for CareerPilot — powered by FastAPI, LangChain, and Gemini.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],  # Backend only; not exposed directly to browser
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "ok",
        "service": "careerpilot-ai-service",
        "version": "0.1.0",
    }


# ─── Root ─────────────────────────────────────────────────────────────────────
@app.get("/", tags=["System"])
async def root():
    """API root — returns service metadata."""
    return {
        "message": "CareerPilot AI Service",
        "version": "0.1.0",
        "docs": "/docs",
        "phase": "0 — Scaffold",
    }
