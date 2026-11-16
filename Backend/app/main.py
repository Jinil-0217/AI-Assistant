from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, documents

settings = get_settings()

app = FastAPI(
    title="AI Knowledge Base Assistant API",
    version="1.0.0",
    description="RAG-powered Knowledge Base Assistant using FastAPI, Supabase pgvector, and Gemini.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(chat.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
