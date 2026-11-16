from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


DocumentStatus = Literal["Pending", "Processing", "Completed", "Failed"]


class DocumentOut(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    content_hash: str
    status: DocumentStatus
    error_message: Optional[str] = None
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime


class DocumentStats(BaseModel):
    total: int
    completed: int
    failed: int
    pending: int
    processing: int


class DocumentListResponse(BaseModel):
    documents: list[DocumentOut]
    stats: DocumentStats
    page: int
    limit: int
    total_count: int


class DocumentProcessResponse(BaseModel):
    document: DocumentOut
    skipped_reembedding: bool = False
    message: str


class SourceCitation(BaseModel):
    document_id: str
    filename: str
    chunk_index: int
    similarity: float
    snippet: str
    token_count: int


class TokenUsage(BaseModel):
    query_tokens: int
    context_tokens: int
    total_prompt_tokens: int
    max_context_tokens: int
    truncated_chunks: int = 0


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    top_k: Optional[int] = Field(default=None, ge=1, le=20)
    document_ids: Optional[list[str]] = None


class ChatResponse(BaseModel):
    conversation_id: str
    answer: str
    sources: list[SourceCitation]
    token_usage: TokenUsage
    no_relevant_context: bool = False


class TokenEstimateRequest(BaseModel):
    text: str = Field(..., max_length=20000)


class TokenEstimateResponse(BaseModel):
    estimated_tokens: int
    character_count: int


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    query_tokens: int = 0
    context_tokens: int = 0
    total_tokens: int = 0
    sources: list[SourceCitation] = Field(default_factory=list)
    created_at: datetime


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    messages: list[MessageOut] = Field(default_factory=list)


class ChatHistoryResponse(BaseModel):
    conversations: list[ConversationOut]
