# AI RAG Assistant — Knowledge Base Assistant

An end-to-end Retrieval-Augmented Generation (RAG) web application that lets users upload `.txt` and `.md` documents, process them into overlapping vector embeddings, filter chat scope by document, and ask grounded questions with source citations and token-usage visibility.

## Live Application
- **Frontend (Vercel):** `https://ai-assistant-ecru-seven.vercel.app`
- **Backend API (Render):** `https://ai-assistant-gsm4.onrender.com` *(Note: Render free tier sleeps after inactivity, so the first request may take ~30–50s to cold-start.)*

## Technology Stack & Reasoning

| Layer | Technology | Reasoning |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS | Mandatory framework; provides fast client/server routing and zero-config deployment on Vercel. |
| **Backend** | Python (FastAPI), Pydantic | Clean separation of routes, business logic, and repository layer; built-in request validation and `pytest` support. |
| **Database** | PostgreSQL (Supabase) | Relational integrity for document lifecycle (`Pending`, `Processing`, `Completed`, `Failed`), conversations, and message history. |
| **Vector Database** | `pgvector` (Supabase) | Eliminates managing a separate vector store while supporting native HNSW indexing and exact/approximate cosine similarity (`<=>`). |
| **Embeddings & LLM** | Gemini `gemini-embedding-001` (truncated to 768 dims) + `gemini-3.1-flash-lite` | Low-latency embeddings with `output_dimensionality=768` and fast grounded generation via the `google-genai` SDK (with retry/fallback handling). |

## Architecture

```
Next.js Frontend (Vercel)
   │
   ├── Dashboard (/)             ──► GET /documents (stats)
   ├── Documents (/documents)    ──► POST /documents/upload, POST /documents/:id/process, DELETE /documents/:id
   └── AI Chat (/chat)           ──► POST /chat (with optional document_ids), GET /chat/history, DELETE /chat/:id
   │
   ▼ HTTPS / REST
FastAPI Backend (Render)
   ├── Chunker & Token Counter   ──► tiktoken (cl100k_base) + SHA-256 deduplication
   ├── RAG Service               ──► Embed query -> Top-K pgvector RPC -> Token budget -> Gemini LLM
   └── Repository Layer          ──► Supabase Python Client
   │
   ▼
Supabase (PostgreSQL + pgvector)
   ├── documents
   ├── document_chunks (vector(768) + HNSW index)
   ├── conversations
   └── messages (stores query_tokens, context_tokens, sources)
```

## Database Schema

Run `Supabase/schema.sql` in your Supabase SQL Editor. It creates:
- `documents`: Stores `id`, `filename`, `file_type` (`.txt`/`.md`), `file_size`, `content_hash` (SHA-256), `raw_content`, `status`, `error_message`, `chunk_count`, `created_at`, `updated_at`.
- `document_chunks`: Stores `id`, `document_id` (cascade delete), `chunk_index`, `content`, `token_count`, `metadata` (JSONB), and `embedding` (`vector(768)`).
- `conversations` & `messages`: Stores chat sessions, user/assistant messages, `query_tokens`, `context_tokens`, `total_tokens`, and `sources` (JSONB).
- `match_document_chunks`: PostgreSQL RPC function performing cosine similarity (`1 - (embedding <=> query_embedding)`) filtered by `status = 'Completed'`, `match_threshold`, and optional `filter_document_ids uuid[]`.

## Vector Database, Chunking & Tokenization Strategy

- **Vector Storage & Metric**: Embeddings are stored as `vector(768)` in `document_chunks` with an HNSW index (`vector_cosine_ops`). Similarity is ranked using cosine similarity (`1 - cosine_distance`), which is scale-invariant for normalized text embeddings.
- **Metadata & Filtering**: Each chunk stores `filename`, `file_type`, and `chunk_index` in `metadata` JSONB, joins against `documents` so only `Completed` documents are searchable, and supports optional document-level scoping via `filter_document_ids`.
- **Chunking & Overlap**: Configurable via `CHUNK_SIZE` (default `800` chars) and `CHUNK_OVERLAP` (default `150` chars). The chunker prefers splitting on paragraph (`\n\n`), sentence (`. `), or word boundaries to preserve semantic continuity.
- **Token Counting & Context Window Management**:
  - The frontend displays a live pre-send token estimate (`ceil(length / 4)`) while typing.
  - On the backend, `tiktoken` (`cl100k_base`, with `len(text)//4` fallback) computes exact token counts. Before calling the LLM, `RAGService.build_context_within_budget()` reserves tokens for the system prompt and user query, then packs Top-K chunks until `MAX_CONTEXT_TOKENS` (default `4000`) is reached, dropping overflow chunks cleanly. Exact `query_tokens`, `context_tokens`, and `total_prompt_tokens` are returned and displayed in the chat UI.
- **Hallucination & Prompt-Injection Control**:
  - Retrieved chunks are wrapped in `<context source="..." chunk="...">...</context>` tags, and the system prompt explicitly instructs the model to ignore any commands inside `<context>`.
  - `TEMPERATURE=0.2` keeps answers factual and deterministic.
  - If no chunks meet `SIMILARITY_THRESHOLD` (default `0.6`), or if the LLM determines the context is insufficient, citations are cleared and a clear fallback message is returned.

## Setup & Local Installation

### 1. Supabase Setup
1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `Supabase/schema.sql`, and click **Run**.
3. Go to **Project Settings → API Keys**, click **View legacy API keys**, and copy your **Project URL** (`https://<ref>.supabase.co`) and **`service_role`** key.

### 2. Backend Setup
```bash
cd Backend
python -m venv venv
# Windows: venv\Scripts\activate
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY
uvicorn app.main:app --reload --port 8000
```

Run backend tests (11 functional & security tests):
```bash
cd Backend
pytest -v
```

### 3. Frontend Setup
```bash
cd Frontend
npm install
cp .env.local.example .env.local
# Ensure NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

## Environment Variables

**Backend (`Backend/.env`):**
- `GEMINI_API_KEY`: Google AI Studio API key
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase `service_role` API key
- `EMBEDDING_MODEL`: `gemini-embedding-001`
- `LLM_MODEL`: `gemini-3.1-flash-lite`
- `CHUNK_SIZE`: `800`
- `CHUNK_OVERLAP`: `150`
- `TOP_K`: `5`
- `SIMILARITY_THRESHOLD`: `0.6`
- `MAX_CONTEXT_TOKENS`: `4000`
- `TEMPERATURE`: `0.2`
- `CORS_ORIGINS`: Comma-separated frontend URLs (e.g., `http://localhost:3000,https://your-app.vercel.app`)

**Frontend (`Frontend/.env.local`):**
- `NEXT_PUBLIC_API_URL`: Deployed or local FastAPI URL

## API Reference

- `POST /documents/upload` — Upload `.txt` or `.md` (`multipart/form-data`, key `file`)
- `GET /documents?page=1&limit=20` — Paginated document list + status counts
- `POST /documents/{id}/process` — Chunk, embed, and index document (skips unchanged `Completed` docs)
- `DELETE /documents/{id}` — Delete document and cascade-delete chunks
- `POST /chat` — `{"query": "...", "conversation_id": null, "document_ids": null}` → returns `answer`, `sources`, `token_usage`, `no_relevant_context`
- `GET /chat/history` — Retrieve conversations and message history
- `DELETE /chat/{conversation_id}` — Delete a conversation and its messages

## Deployment Guide (Render + Vercel)
1. **Backend (Render)**: Create a Web Service with Root Directory `Backend`, build command `pip install -r requirements.txt`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Add all backend env vars and set `CORS_ORIGINS` to your Vercel URL.
2. **Frontend (Vercel)**: Import repo, set Root Directory to `Frontend`, add `NEXT_PUBLIC_API_URL=https://your-render-service.onrender.com`, and deploy.

## Known Limitations & Potential Improvements
- Currently supports `.txt` and `.md` files; PDF/DOCX parsing can be added with `pypdf` / `python-docx`.
- Pre-send token count in the input box is a fast character-based approximation (`ceil(length / 4)`); exact `tiktoken` counts are computed server-side and returned with each response.
- Adding Supabase Auth or session-scoped workspaces would isolate documents per user.
- Hybrid search (BM25 full-text + pgvector) would improve exact keyword/acronym matching.
