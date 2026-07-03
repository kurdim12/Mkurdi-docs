# MKurdi Operations

**ذاكرة شركة المقاولات** — AI document-intelligence platform for a Jordanian construction contracting company.

Contractors lose hours daily searching contracts, official letters (كتب), bank guarantees (كفالات), and interim payment certificates (مستخلصات) — mostly Arabic PDFs, many scanned. MKurdi Operations ingests every project PDF, extracts it into structured ledgers, tracks deadlines, and answers questions with **page-level citations**. Citations are the product: every answer is traceable to «document — صفحة N».

## What it does — the three ledgers

Every uploaded PDF is parsed page-by-page by a vision model, classified, and — when it matches — written into a ledger:

| Ledger | Table | What it tracks |
|---|---|---|
| **المراسلات** (correspondence) | `letters` | Incoming/outgoing official letters, who must reply, and the reply deadline — computed even from phrases like «خلال ١٤ يوماً» |
| **الكفالات** (bank guarantees) | `guarantees` | Type (دخول عطاء / حسن تنفيذ / دفعة مقدمة / صيانة), bank, amount, expiry date |
| **المستخلصات** (IPCs) | `ipcs` | Claim number, claimed / certified / paid amounts, retention held, payment status |

The **Morning Brief** (الموجز الصباحي) surfaces the urgent slice of all three: letters awaiting reply ordered by deadline, guarantees expiring within 45 days, and unpaid IPCs.

On top of the ledgers sits **RAG chat**: ask in Arabic or English, get an answer built only from your documents, with numbered source chips linking each claim to a document and page.

## Architecture

```
┌─────────────────────┐         ┌──────────────────────────────────────────────┐
│  apps/web           │  HTTPS  │  apps/api — Hono on Cloudflare Workers       │
│  Next.js 15 (RTL)   ├────────►│                                              │
│  الموجز الصباحي      │         │  routes: /projects /documents /files         │
│  رفع الوثائق         │         │          /chat /search /brief /letters       │
│  اسأل الوثائق        │         └───┬─────────┬─────────┬─────────┬────────────┘
└─────────────────────┘             │         │         │         │
                                    ▼         ▼         ▼         ▼
                              ┌────────┐ ┌────────┐ ┌─────────┐ ┌────────────┐
                              │   D1   │ │   R2   │ │Vectorize│ │ Workflows  │
                              │ledgers │ │  PDFs  │ │ chunks  │ │  INGEST    │
                              │metadata│ │+ parsed│ │1024-dim │ │ (durable,  │
                              │  chat  │ │markdown│ │ cosine  │ │ per-step   │
                              └────────┘ └────────┘ └─────────┘ │  retries)  │
                                                                └─────┬──────┘
                     Ingest pipeline (per PDF):                       │
                     parse-pdf ──► classify-extract ──► chunk-store ──► embed-upsert ──► mark-ready
                        │               │                                  │
                        ▼               ▼                                  ▼
                   OpenRouter      OpenRouter                        Workers AI
                   file plugin     JSON extract                     @cf/baai/bge-m3
                   engine:native   (ledger rows)                    (multilingual)
```

**Page-tagged parsing** is the spine: the parse prompt wraps every page as `<page n="X">…</page>`; page numbers flow through chunks → Vectorize metadata → chat citations.

## Locked decisions

- **Embeddings:** Workers AI `@cf/baai/bge-m3`, 1024 dims, cosine. **Never change it** — changing it means re-embedding everything.
- **PDF parsing:** OpenRouter file plugin with **`engine: "native"` forced**. Never use free text-extraction engines — they destroy Arabic. One vision pipeline for all PDFs, digital or scanned.
- **Arabic content is never translated, transliterated, or "cleaned up"** anywhere in the pipeline. `normalizeArabic` is applied to embedding input only; stored and displayed text is always the raw transcription.
- **Frontend:** Arabic-first RTL, Tailwind logical properties only (`ms- me- ps- pe- border-s border-e start- end-`).
- **Single-tenant v1:** optional `x-api-key` gate (set the `API_KEY` secret to enable it). `/files/*` is exempt — it is protected by 20-minute HMAC-signed URLs instead, so OpenRouter can fetch PDFs in `url` mode.

## Setup

```bash
npm install

# 1. Create the Cloudflare resources (account-specific — run once)
npx wrangler d1 create mkurdi-ops-db                    # paste database_id into apps/api/wrangler.jsonc
npx wrangler vectorize create mkurdi-ops-chunks --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index mkurdi-ops-chunks --property-name=project_id --type=string
#   ^ MUST exist BEFORE any vector upsert, or project filtering silently fails
npx wrangler r2 bucket create mkurdi-ops-docs

# 2. Secrets (never hardcode, never commit)
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SIGNING_SECRET
# optional: npx wrangler secret put API_KEY

# 3. Schema
npm run db:apply            # local dev database
npm run db:apply:remote     # production database
```

For local dev, create `apps/api/.dev.vars` (gitignored):

```
OPENROUTER_API_KEY=sk-or-...
SIGNING_SECRET=any-long-random-string
```

Then:

```bash
npm run dev:api    # Hono API on http://localhost:8787
npm run dev:web    # Next.js on http://localhost:3000 (set apps/web/.env.local from .env.example)
npm run deploy:api # deploy the Worker
```

## PARSE_MODE — `base64` vs `url`

| | `base64` (default) | `url` |
|---|---|---|
| How the PDF reaches OpenRouter | Read from R2, sent inline as `data:application/pdf;base64,...` | OpenRouter fetches a 20-minute HMAC-signed `/files/{id}` URL |
| Works on localhost | ✅ yes | ❌ no (OpenRouter can't reach localhost) |
| Request size | Large (whole PDF in the request body) | Tiny |
| When to use | Local dev, small deployments | **Production, after deploy** — set `PARSE_MODE: "url"` and `PUBLIC_API_URL` to the deployed Worker URL in `wrangler.jsonc` |

## Swapping models

`MODEL_EXTRACT` (parsing + classification) and `MODEL_CHAT` (chat + letter drafting) are `vars` in `wrangler.jsonc`, default `google/gemini-2.5-flash`. Any OpenRouter model that supports the file plugin works for `MODEL_EXTRACT`. **The embedding model is not swappable** — it is locked to `@cf/baai/bge-m3` (1024-dim Vectorize index).

## API

All routes JSON; if the `API_KEY` secret is set, send `x-api-key` on everything except `/files/*`.

| Route | Behavior |
|---|---|
| `GET /` | Health: `{name, ok:true}` |
| `GET /projects` | Projects + `doc_count` + `open_letters` counts |
| `POST /projects` | `{name*, client_name?, contract_value?, currency?, start_date?}` → 201 |
| `GET /projects/:id` | Project + all letters + guarantees + ipcs |
| `POST /projects/:projectId/documents` | Multipart field `file` (PDF only) → stores in R2, starts ingest workflow → 201 |
| `GET /projects/:projectId/documents` | Documents newest-first with status/type/summary |
| `GET /documents/:id` | Document + its ledger row |
| `GET /files/:documentId?exp&sig` | HMAC-signed, time-limited PDF stream (403 on bad/expired signature) |
| `POST /projects/:id/chat` | `{message*, history?}` → `{answer, sources:[{n, document_id, title, page, snippet, score}]}` — retrieval topK 8, score ≥ 0.35, filtered to the project |
| `POST /search` | `{query*}` → cross-project search results with project names |
| `GET /brief` | `{generated_at, letters, guarantees, ipcs}` — open letters by deadline, guarantees expiring ≤45 days, unpaid IPCs; `days_left` computed per row |
| `POST /letters/generate` | `{instructions*, project_id?, reply_to_document_id?}` → `{html}` — formal Jordanian letter as a printable A4 RTL HTML document |

## The 5-PDF acceptance gate (run with real company documents)

Upload these five to a test project and confirm the Arabic survives, page counts are right, ledgers populate, and chat cites pages:

1. Clean digital Arabic contract
2. Digital BOQ with tables
3. Scanned + stamped contract
4. Bad photocopy
5. Mixed-language document with handwritten margins (expect `[هامش]:` prefixes)

If Arabic survives #3–#5, the foundation is proven.

## Roadmap

- Money-ledger UI (claimed vs certified vs paid across projects)
- WhatsApp cron brief (push الموجز الصباحي every morning)
- Cloudflare Access auth (replace the api-key gate)
- Browser Rendering to render generated letters to PDF
- BOQ pricing intelligence (unit-rate benchmarks across projects)

## Repo map

```
apps/api   Hono on Cloudflare Workers — routes/, workflows/ingest.ts, lib/ (openrouter, chunker, embeddings, sign, prompts), db/schema.sql
apps/web   Next.js 15 App Router, Arabic-first RTL — الموجز الصباحي, project page (upload + ledgers), RAG chat
```

## Manual steps the human still must run

1. The Phase-0 `wrangler` commands above (D1 create → paste `database_id`, Vectorize index **and metadata index**, R2 bucket, secrets).
2. `npm run db:apply:remote` for the production schema.
3. After the first deploy: set `PARSE_MODE: "url"` and `PUBLIC_API_URL` to the Worker's public URL in `apps/api/wrangler.jsonc`, then redeploy.
4. Point `apps/web/.env.local` (or the hosting env) at the deployed API URL and deploy the web app.
5. Run the 5-PDF acceptance gate with real company documents.
