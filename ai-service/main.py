"""
CareerPilot AI — FastAPI AI Service Entry Point
"""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.auth import require_internal_token
from app.core.errors import AIServiceError
from app.routers.internal import router as internal_router
from app.services.copilot_provider import CopilotProvider
from app.services.storage import PostgresStorage


MAX_INGEST_REQUEST_BYTES = 5 * 1024 * 1024


class IngestBodyLimitMiddleware:
    def __init__(self, app, *, max_bytes: int = MAX_INGEST_REQUEST_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/internal/v1/knowledge/ingest"
        ):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > self.max_bytes:
                    await self._reject(scope, send)
                    return
            except ValueError:
                pass

        messages = []
        total_bytes = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] != "http.request":
                break
            total_bytes += len(message.get("body", b""))
            if total_bytes > self.max_bytes:
                await self._reject(scope, send)
                return
            if not message.get("more_body", False):
                break

        async def replay_body():
            if messages:
                return messages.pop(0)
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay_body, send)

    async def _reject(self, scope, send) -> None:
        response = JSONResponse(
            status_code=413,
            content={"detail": f"Ingest request exceeds {self.max_bytes} bytes"},
        )

        async def receive_empty_request():
            return {"type": "http.request", "body": b"", "more_body": False}

        await response(scope, receive_empty_request, send)


@asynccontextmanager
async def lifespan(application: FastAPI):
    yield
    await application.state.knowledge_storage.close()

# ─── App Instance ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="CareerPilot AI Service",
    description="Private retrieval and grounded Career Copilot inference service.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)
app.state.knowledge_storage = PostgresStorage()
app.state.provider_factory = CopilotProvider
app.include_router(
    internal_router,
    prefix="/internal/v1",
    dependencies=[Depends(require_internal_token)],
)
app.add_middleware(IngestBodyLimitMiddleware)

@app.exception_handler(AIServiceError)
async def ai_service_error_handler(request: Request, exc: AIServiceError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


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
        "phase": "Batch 7 — RAG and Career Copilot",
    }
