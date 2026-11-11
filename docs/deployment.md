# Deployment checklist

This guide describes the existing Vercel, Render, and Supabase architecture.
It does not deploy services, create resources, apply migrations, or modify user
data. Use the `master` branch and review `render.yaml` before creating a
Blueprint.

## Deployment blockers to resolve first

- The backend verifies Supabase access tokens through the project's JWKS
  endpoint and allows `ES256` and `RS256` only. Confirm that the active Supabase
  JWT signing key is asymmetric and that newly issued tokens use one of those
  algorithms. Legacy `HS256` tokens are not accepted; changing signing keys can
  affect existing sessions, so plan that change with the project owner.
- The AI service requires an AVX2-capable Linux CPU. The passing Ubuntu CI
  workflow downloaded and loaded the pinned model, used `CPUExecutionProvider`,
  verified finite, normalized 384-dimensional embeddings, and measured
  159.5 MiB peak RSS for the smoke test. These are CI measurements, not a
  guarantee of Render CPU flags, memory headroom, cold starts, or download
  reliability. Verify those on the selected Render instance before relying on
  AI endpoints.
- `openai/gpt-oss-20b` is configured for Groq strict JSON Schema output. The
  model is documented as supporting this mode, but availability for the
  deployment account must be confirmed by an owner with access to that account.
- Render Free services can sleep, restart, and lose local files. The model
  cache is disposable; first AI use after a cold start or cache loss downloads
  the model and tokenizer again. Check current Render plan limits and account
  usage before relying on two free web services.

## 1. Prepare Supabase

1. Select the intended Supabase project. Record its project URL, project
   reference, database connection strings, and publishable/anon key. Do not use
   the service-role key in the browser or as `SUPABASE_ANON_KEY`.
2. Confirm Auth issues JWTs with an asymmetric signing key supported by the
   backend (`ES256` or `RS256`). Verify the issuer is
   `https://<project-ref>.supabase.co/auth/v1` and the audience is
   `authenticated`. Do not rotate a live signing key without accounting for
   existing sessions.
3. Create a **private** Storage bucket named `resumes`. Configure Storage
   policies so users can access only objects under their own UUID folder.
   Never make the bucket public.
4. Confirm the `vector` extension is available in the `extensions` schema.
5. Review `backend/prisma/schema.prisma` and migrations `0001`–`0005`. Render's
   build runs `prisma generate`, not `prisma migrate`. Apply the approved
   migrations to the selected database through the project's separate database
   change process **before** enabling application traffic. Do not use
   `prisma db push` as a deployment shortcut.
6. Configure connections with TLS:
   - Backend `DATABASE_URL`: Supabase PostgreSQL transaction pooler URL.
   - Backend `DIRECT_URL`: Supabase PostgreSQL session/direct URL for Prisma's
     direct connection.
   - AI service `DATABASE_URL`: Supabase PostgreSQL pooler or direct URL usable
     by `asyncpg`. The client disables asyncpg's named statement cache for
     transaction-pooler compatibility.
   Use the provider's current connection strings and keep connections within
   project limits. These are separate service environment variables, even when
   they refer to the same Supabase project.

## 2. Create the Render Blueprint

1. In Render, choose **New → Blueprint**, connect
   `pandeyrudrashekhar-cmd/careerpilot-ai`, select branch **`master`**, and
   review the Blueprint preview before applying it.
2. Confirm the preview contains exactly these two web services:

   | Service | Root directory | Runtime | Build | Start | Health check |
   |---|---|---|---|---|---|
   | `careerpilot-ai-service` | `ai-service` | Python (`ai-service/.python-version`, 3.14) | `pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT` | `/health` |
   | `careerpilot-backend` | `backend` | Node 24.16.0 (`backend/.node-version`) | `npm ci --include=dev && npm run db:generate && npm run build` | `npm run start` | `/api/health` |

   The branch is pinned to `master` on both services in `render.yaml`. The
   backend's `AI_SERVICE_URL` is linked to the AI service's Render `host`
   reference. The backend accepts its private hostname as
   `http://<private-hostname>:10000`; a public `.onrender.com` hostname is
   normalized to HTTPS. Do not replace it with a localhost address.
3. Create/review the Blueprint services. Do not enable production traffic until
   all manual values below are entered and verified. `sync: false` values are
   intentionally prompted for manually; they are not stored in the repository.

### AI-service environment

| Name | Entry |
|---|---|
| `AI_SERVICE_INTERNAL_TOKEN` | Manually generate a random secret of at least 32 characters. Enter the exact same value in the backend service. |
| `DATABASE_URL` | Manually enter the Supabase PostgreSQL connection URL, including required TLS settings. |
| `GROQ_API_KEY` | Manually enter the server-side Groq key. Never put it in Vercel or source control. |
| `GROQ_MODEL` | Blueprint default: `openai/gpt-oss-20b`. Confirm model access separately. |
| `LOCAL_EMBEDDING_PROVIDER` | Blueprint default: `onnx`; do not change to an unsupported provider. |
| `LOCAL_EMBEDDING_CACHE_DIR` | Blueprint uses `/tmp/careerpilot-ai/minilm-onnx`. This is an ephemeral cache and will be repopulated after a restart. |

`PORT` is supplied by Render. The pinned ONNX and tokenizer files download
lazily from the pinned Hugging Face model revision into the cache directory.
The selected `model_quint8_avx2.onnx` requires AVX2. The service uses the
ONNX CPU provider and one intra-op/inter-op thread; keep it at one Uvicorn
worker unless memory and CPU are measured on the target plan.

### Backend environment

| Name | Entry |
|---|---|
| `NODE_ENV` | Blueprint default: `production`. |
| `NODE_VERSION` | Blueprint default: `24.16.0`; also pinned by `backend/.node-version`. |
| `PORT` | Supplied by Render; the backend reads this value and binds its Express listener to it. |
| `FRONTEND_URL` | Manually enter the exact Vercel production origin, for example `https://<your-project>.vercel.app`, with no path or trailing slash. This is the CORS allowlist; previews are not implicitly allowed. |
| `AI_SERVICE_URL` | Render Blueprint reference to `careerpilot-ai-service` host. A private Render hostname uses internal HTTP on port `10000`; a public `.onrender.com` hostname uses HTTPS. |
| `AI_SERVICE_INTERNAL_TOKEN` | Manually enter the same random value used by the AI service. |
| `DATABASE_URL` | Manually enter the Supabase transaction-pooler connection URL. |
| `DIRECT_URL` | Manually enter the Supabase session/direct connection URL. |
| `SUPABASE_URL` | Manually enter `https://<project-ref>.supabase.co`. |
| `SUPABASE_ANON_KEY` | Manually enter the Supabase publishable/anon key, not the service-role key. |
| `SUPABASE_RESUME_BUCKET` | Blueprint default: `resumes`; ensure the private bucket and policies exist. |
| `GROQ_API_KEY` | Manually enter the backend's server-side Groq key. |
| `GROQ_MODEL` | Blueprint default: `openai/gpt-oss-20b`. |
| `RESUME_MAX_SIZE_BYTES` | Blueprint default: `10485760` (10 MiB). Do not increase without testing memory and timeouts. |

## 3. Deploy the Vercel frontend

1. Import the same GitHub repository into Vercel and set **Root Directory** to
   `frontend` (enable the monorepo root-directory setting if prompted).
2. Use build command `npm run build` and output directory `dist`. The project
   build runs TypeScript project checks and Vite. `frontend/vercel.json` sends
   application routes to `/index.html` for SPA navigation.
3. Add these **public** environment variables for the Production environment:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://<careerpilot-backend-host>.onrender.com/api` |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key only. |

   `VITE_API_URL` is the current frontend setting. `VITE_API_BASE_URL` remains
   accepted as a compatibility fallback. If both are set, `VITE_API_URL` wins.
   These values are compiled into the browser bundle: only public URLs and the
   publishable/anon key belong here.
4. Never add `GROQ_API_KEY`, `DATABASE_URL`, `DIRECT_URL`,
   `AI_SERVICE_INTERNAL_TOKEN`, or a Supabase service-role key to Vercel or any
   `VITE_*` variable.
5. Deploy the frontend only after the backend URL is known. Then set the exact
   Vercel production origin in the Render backend's `FRONTEND_URL` and redeploy
   the backend if it changed.

## 4. Deployment order and smoke tests

1. Complete Supabase setup, JWT-key compatibility confirmation, private bucket
   policies, and the separately approved migrations.
2. Review and create the Render Blueprint on `master`. Confirm AI service
   health at `/health`; then confirm backend health at `/api/health`.
3. Enter all manual Render environment values, verify the generated AI-service
   reference is HTTPS, and verify both services show the intended branch and
   monorepo root directory.
4. Deploy the Vercel frontend with the three public variables above. Add its
   final production origin to `FRONTEND_URL`.
5. Using a designated test account, smoke-test login/logout, authenticated
   profile read/update, resume list/read, and one non-destructive job or
   application read. Verify browser requests go to the HTTPS Express API, not
   directly to the AI service.
6. Verify backend-to-AI authentication and database connectivity using
   read-only knowledge status for the test account. To validate actual model
   inference on Render, use only a disposable test account/document and follow
   the approved cleanup process; do not re-index or modify real user data as a
   deployment check.
7. Test a controlled AI request only after the Groq model has been confirmed
   available. Check explicit provider errors, and do not treat a health response
   as proof of model availability.
8. Inspect Render logs and metrics for startup errors, repeated model downloads,
   memory pressure, and cold-start behavior. Do not log request bodies, access
   tokens, resumes, or provider keys. Confirm the ONNX load and inference fit
   the actual Render CPU/memory allocation before enabling AI use.

The backend allows one configured `FRONTEND_URL` origin. Add preview origins
only through a deliberate CORS configuration change. Resource-intensive
authenticated backend routes have an in-memory limit of 10 requests per user
per minute; it is per process and is not a distributed quota.

The [Linux ONNX CI run](https://github.com/pandeyrudrashekhar-cmd/careerpilot-ai/actions/runs/43063946052)
passed for commit `f9e435a6ce7ea4ec17046a7ed6281358a5be84f9` under Python 3.12.
It validated Linux model download, AVX2, CPU execution, embedding dimensions
and normalization, a 2 GiB CI smoke ceiling, and the native offline AI-service
tests. The Render runtime pin and Linux workflow now both target Python 3.14;
review the workflow run for the exact commit before relying on its compatibility
results. Render-specific CPU, memory, ephemeral storage, and cold-start
compatibility also require measurement on the selected Render instance.

The backend npm audit still reports the Prisma CLI transitive advisory; its
safe fix requires a Prisma major migration. See
[`security-dependency-advisories.md`](./security-dependency-advisories.md).

Provider documentation:

- [Render free services](https://render.com/docs/free)
- [Render Blueprints](https://render.com/docs/blueprint-spec)
- [Vercel build configuration](https://vercel.com/docs/deployments/configure-a-build)
- [Vercel project settings](https://vercel.com/docs/projects/overview)
- [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs)
- [Groq models](https://console.groq.com/docs/models)
