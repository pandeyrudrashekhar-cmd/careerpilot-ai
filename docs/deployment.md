# Deployment guide

This repository is prepared for a Vercel frontend, Render Express API, Render
FastAPI service, and Supabase database/auth/storage. This guide does not deploy
services, apply migrations, create resources, or re-index data.

## Before deploying

- Confirm that the current Vercel, Render, Supabase, and Groq account plans and
  limits fit your expected use. Free tiers and provider model availability can
  change; this repository cannot guarantee uninterrupted or permanently free
  operation.
- The AI service downloads its pinned ONNX and tokenizer artifacts from
  Hugging Face when first needed, then caches them under
  `LOCAL_EMBEDDING_CACHE_DIR` (default: `~/.cache/careerpilot-ai/minilm-onnx`).
  The selected `model_quint8_avx2.onnx` requires an AVX2-capable CPU. Linux/Render
  validation is provided by `.github/workflows/ai-service-linux.yml`, including
  model download, CPU provider, normalized 384-dimensional embeddings, AVX2,
  and a 2 GiB peak-RSS ceiling. The workflow must pass in GitHub before treating
  Linux compatibility as verified. This does not certify Render CPU flags,
  memory headroom, cold-start time, or artifact download behavior; verify those
  separately before enabling ingestion or Copilot.
- Free web instances can sleep or restart and their local filesystems are not a
  durable model cache. Expect the model to be downloaded again after a fresh
  instance. Assess startup time and memory after the first inference. If the
  free instance cannot load ONNX reliably, do not enable AI endpoints there.
- Render free-instance hours and resource limits are account/plan-dependent.
  Two free web services may exceed an account's monthly free hours or resource
  budget. Check current Render documentation and account usage before keeping
  both services available.
- The job provider registry is empty by default. The Jobs page searches jobs
  stored in the application's database; no external job feed is configured.

## 1. Prepare Supabase

1. Create or select a Supabase project and record its URL, publishable/anon key,
   database URLs, and project region.
2. Create the private Storage bucket named `resumes` (or use the configured
   `SUPABASE_RESUME_BUCKET`) and install the documented user-folder policies.
   Never make resume objects public.
3. Confirm that pgvector is available for the AI service. The application uses
   Supabase PostgreSQL; do not point either service at an unrelated database.
4. Review the migrations in `backend/prisma/migrations`. Apply migrations only
   through the approved database change process. Deployment does not apply
   migrations automatically.
5. Use Supabase's transaction pooler for backend `DATABASE_URL` where
   appropriate, and a direct/session connection for `DIRECT_URL` and AI-service
   `DATABASE_URL`. Preserve the provider's SSL requirements. Keep connection
   counts within the Supabase plan limits.

## 2. Deploy the AI service on Render

1. In Render, create a Blueprint from the repository and review
   [`render.yaml`](../render.yaml), or create a Web Service manually with root
   directory `ai-service`.
2. Use the existing `ai-service/.python-version` runtime pin.
3. Build with `pip install -r requirements.txt`; start with
   `uvicorn main:app --host 0.0.0.0 --port $PORT`; configure `/health` as the
   health-check path.
4. Set `AI_SERVICE_INTERNAL_TOKEN` to a cryptographically random value of at
   least 32 characters. Keep it private; the exact same value must be set on
   the backend service.
5. Set the Supabase PostgreSQL `DATABASE_URL`, `GROQ_API_KEY`, and
   `GROQ_MODEL=openai/gpt-oss-20b`. Keep all of these server-side.
6. Do not set a Windows `LOCAL_EMBEDDING_CACHE_DIR` on Render. The default is
   Linux-compatible. The service downloads its pinned model lazily; allow for
   network failure, cold starts, and ephemeral cache loss.
7. Verify `/health`, then run an authenticated, non-production embedding
   smoke test. Do not run ingestion or re-indexing as part of deployment.

## 3. Deploy the backend on Render

1. Configure the second Web Service with root directory `backend` and Node
   `24.16.0` as pinned in `backend/.node-version`.
2. Build with
   `npm ci --include=dev && npm run db:generate && npm run build`; start with
   `npm run start`; configure `/api/health` as the health-check path.
3. Set `NODE_ENV=production`, `FRONTEND_URL` to the exact production Vercel
   origin, and `AI_SERVICE_URL` to the private AI service's HTTPS base URL.
4. Set the same `AI_SERVICE_INTERNAL_TOKEN` as the AI service. Set
   `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_RESUME_BUCKET=resumes`, and server-side `GROQ_API_KEY` /
   `GROQ_MODEL=openai/gpt-oss-20b`.
5. Keep `RESUME_MAX_SIZE_BYTES` at or below 10 MiB unless the service memory,
   Storage limits, and upload timeouts are measured and intentionally changed.
6. Confirm the health endpoint, authenticated profile read, and a small
   non-destructive API read. Do not migrate production data as part of this
   checklist.

Production resume upload/analysis, interview generation/evaluation, Copilot,
and knowledge ingest/reindex routes share an in-memory limit of 10
resource-intensive requests per authenticated user per minute. This is a
per-process safeguard, not a distributed quota; it resets on process restart
and does not replace provider-side limits.

`NODE_ENV=production` requires HTTPS for `AI_SERVICE_URL`. CORS currently
allows the single `FRONTEND_URL` origin, so Vercel preview deployments are not
automatically trusted.

## 4. Deploy the frontend on Vercel Hobby

1. Import the repository and set the Vercel project root to `frontend`.
2. Use `npm run build` and `dist` as the output directory. `frontend/vercel.json`
   configures SPA route fallback.
3. Set these **public** build variables:
   - `VITE_API_BASE_URL=https://<backend-host>/api`
   - `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<Supabase publishable-or-anon-key>`
4. Only public Supabase URL/key values belong in Vite variables. Never add
   `GROQ_API_KEY`, database URLs, the service-role key, or
   `AI_SERVICE_INTERNAL_TOKEN` to Vercel frontend variables or source code.
5. Add the final Vercel production origin to the backend's `FRONTEND_URL`, then
   redeploy the backend if that value changed.

## 5. Post-deployment checks and limitations

- Confirm browser requests target the HTTPS Express API, not the AI service.
- Check the Render health paths and backend logs for startup errors; do not log
  request bodies, access tokens, resume contents, or provider keys.
- Exercise login, profile save, resume list/read, job search, application
  creation, roadmap generation, and interview flows using a designated test
  account. Use a disposable test resume and avoid production re-indexing.
- Confirm AI generation and strict JSON output with the configured Groq model.
  The official Groq Structured Outputs documentation currently lists
  `openai/gpt-oss-20b` for `strict: true`; actual account entitlement and model
  availability must still be confirmed with the configured account.
- If an AI provider is unconfigured or unavailable, the application returns an
  explicit error. Interview questions can also be added manually. No provider
  failure should be treated as a successful AI response.
- Run the repository's AI, backend, and frontend tests and builds before each
  release. No GitHub Actions run or Linux Render runtime is available in this
  workspace; Linux ONNX compatibility remains an explicit release blocker
  until the new workflow passes and Render resources are measured.

The current backend npm audit contains a Prisma CLI transitive advisory that
requires a Prisma major upgrade to resolve safely. See
[`security-dependency-advisories.md`](./security-dependency-advisories.md) for
the dependency path, fixed versions, and remediation decision.

Provider documentation:

- [Render free services](https://render.com/docs/free)
- [Render Blueprints](https://render.com/docs/blueprint-spec)
- [Vercel build configuration](https://vercel.com/docs/deployments/configure-a-build)
- [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs)
- [Groq models](https://console.groq.com/docs/models)
