from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.supabase_client import DatabaseRepository, get_db
from app.schemas.models import (
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ConversationOut,
    TokenEstimateRequest,
    TokenEstimateResponse,
)
from app.services.chunker import count_tokens
from app.services.rag import RAGService

router = APIRouter(prefix="/chat", tags=["chat"])


def get_rag_service(db: DatabaseRepository = Depends(get_db)) -> RAGService:
    return RAGService(db=db)


@router.post("/estimate-tokens", response_model=TokenEstimateResponse)
def estimate_tokens(payload: TokenEstimateRequest):
    return TokenEstimateResponse(
        estimated_tokens=count_tokens(payload.text),
        character_count=len(payload.text),
    )


@router.post("", response_model=ChatResponse)
def chat_with_kb(
    payload: ChatRequest,
    db: DatabaseRepository = Depends(get_db),
    rag: RAGService = Depends(get_rag_service),
):
    query = payload.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query cannot be empty.",
        )

    conv_id = payload.conversation_id
    if conv_id:
        existing = db.get_conversation(conv_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
    else:
        conv = db.create_conversation(title=query[:60])
        conv_id = conv["id"]

    try:
        answer, citations, token_usage, no_relevant_context = rag.answer_question(
            query=query,
            top_k=payload.top_k,
            document_ids=payload.document_ids,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service unavailable: {exc}",
        )

    db.add_message(
        conversation_id=conv_id,
        role="user",
        content=query,
        query_tokens=token_usage.query_tokens,
    )
    db.add_message(
        conversation_id=conv_id,
        role="assistant",
        content=answer,
        query_tokens=token_usage.query_tokens,
        context_tokens=token_usage.context_tokens,
        total_tokens=token_usage.total_prompt_tokens,
        sources=[c.model_dump() for c in citations],
    )

    return ChatResponse(
        conversation_id=conv_id,
        answer=answer,
        sources=citations,
        token_usage=token_usage,
        no_relevant_context=no_relevant_context,
    )

@router.get("/history", response_model=ChatHistoryResponse)
def get_chat_history(
    limit: int = Query(default=20, ge=1, le=50),
    db: DatabaseRepository = Depends(get_db),
):
    conversations = db.list_conversations_with_messages(limit=limit)
    return ChatHistoryResponse(
        conversations=[ConversationOut(**c) for c in conversations]
    )

@router.delete("/{conversation_id}", status_code=status.HTTP_200_OK)
def delete_conversation(
    conversation_id: str,
    db: DatabaseRepository = Depends(get_db),
):
    deleted = db.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    return {"deleted": True, "id": conversation_id}
