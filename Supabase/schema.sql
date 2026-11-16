-- Enable pgvector extension for 768-dimensional Gemini embeddings
create extension if not exists vector;

-- 1. Documents table (stores uploaded file metadata & lifecycle status)
create table if not exists documents (
    id uuid primary key default gen_random_uuid(),
    filename text not null,
    file_type text not null check (file_type in ('.txt', '.md')),
    file_size integer not null check (file_size >= 0),
    content_hash text not null,
    raw_content text not null,
    status text not null default 'Pending' check (status in ('Pending', 'Processing', 'Completed', 'Failed')),
    error_message text,
    chunk_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_documents_status on documents (status);
create index if not exists idx_documents_hash on documents (content_hash);

-- 2. Document chunks table (stores chunked text + 768-dim vector embeddings)
create table if not exists document_chunks (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references documents (id) on delete cascade,
    chunk_index integer not null,
    content text not null,
    token_count integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    embedding vector(768) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_chunks_document_id on document_chunks (document_id);

-- HNSW index for fast approximate cosine similarity search
create index if not exists idx_chunks_embedding_hnsw
    on document_chunks
    using hnsw (embedding vector_cosine_ops);

-- 3. Conversations table
create table if not exists conversations (
    id uuid primary key default gen_random_uuid(),
    title text not null default 'New Conversation',
    created_at timestamptz not null default now()
);

-- 4. Messages table (stores user queries, AI responses, token counts, and citations)
create table if not exists messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references conversations (id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    query_tokens integer not null default 0,
    context_tokens integer not null default 0,
    total_tokens integer not null default 0,
    sources jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_id on messages (conversation_id, created_at);

-- 5. Vector similarity search RPC (Cosine Similarity = 1 - Cosine Distance)
-- Optional filter_document_ids restricts the search to selected documents
drop function if exists match_document_chunks(vector, float, int);

create or replace function match_document_chunks (
    query_embedding vector(768),
    match_threshold float default 0.35,
    match_count int default 5,
    filter_document_ids uuid[] default null
)
returns table (
    id uuid,
    document_id uuid,
    filename text,
    chunk_index int,
    content text,
    token_count int,
    metadata jsonb,
    similarity float
)
language sql stable
as $$
    select
        dc.id,
        dc.document_id,
        d.filename,
        dc.chunk_index,
        dc.content,
        dc.token_count,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) as similarity
    from document_chunks dc
    join documents d on d.id = dc.document_id
    where d.status = 'Completed'
      and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
      and 1 - (dc.embedding <=> query_embedding) >= match_threshold
    order by dc.embedding <=> query_embedding asc
    limit match_count;
$$;
