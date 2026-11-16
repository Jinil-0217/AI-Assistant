from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.config import get_settings
from app.db.supabase_client import DatabaseRepository, get_db
from app.schemas.models import (
    DocumentListResponse,
    DocumentOut,
    DocumentProcessResponse,
    DocumentStats,
)
from app.services.chunker import chunk_text, compute_sha256
from app.services.rag import RAGService

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_EXTENSIONS = {".txt", ".md"}


def get_rag_service(db: DatabaseRepository = Depends(get_db)) -> RAGService:
    return RAGService(db=db)


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: DatabaseRepository = Depends(get_db),
):
    settings = get_settings()
    filename = file.filename or "untitled.txt"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Only .txt and .md files are allowed.",
        )

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(raw_bytes) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {settings.max_upload_size_bytes // (1024 * 1024)} MB.",
        )

    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be valid UTF-8 encoded text.",
        )

    content_hash = compute_sha256(text)
    doc = db.create_document(
        filename=filename,
        file_type=ext,
        file_size=len(raw_bytes),
        content_hash=content_hash,
        raw_content=text,
    )
    return DocumentOut(**doc)


@router.get("", response_model=DocumentListResponse)
def list_documents(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: DatabaseRepository = Depends(get_db),
):
    docs, stats, total_count = db.list_documents(page=page, limit=limit)
    return DocumentListResponse(
        documents=[DocumentOut(**d) for d in docs],
        stats=DocumentStats(**stats),
        page=page,
        limit=limit,
        total_count=total_count,
    )


@router.post("/{document_id}/process", response_model=DocumentProcessResponse)
def process_document(
    document_id: str,
    db: DatabaseRepository = Depends(get_db),
    rag: RAGService = Depends(get_rag_service),
):
    doc = db.get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # Skip unnecessary re-embedding if this exact document is already Completed
    if doc["status"] == "Completed" and doc["chunk_count"] > 0:
        return DocumentProcessResponse(
            document=DocumentOut(**doc),
            skipped_reembedding=True,
            message="Document is already processed and unchanged; skipped re-embedding.",
        )

    # Also check if another Completed document has the identical content_hash
    existing_same = db.get_completed_by_hash(doc["content_hash"])
    if existing_same and existing_same["id"] != document_id:
        # Still index this document's chunks only if needed, or mark skipped?
        # To keep deletion independent per document, we still index or copy; here we index cleanly unless same doc.
        pass

    db.update_document_status(document_id, status="Processing", error_message=None)

    try:
        settings = get_settings()
        chunks = chunk_text(
            doc["raw_content"],
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        if not chunks:
            raise ValueError("Document contains no indexable text after cleaning.")

        embeddings = rag.embed_texts([c.content for c in chunks], task_type="RETRIEVAL_DOCUMENT")

        chunk_rows = [
            {
                "document_id": document_id,
                "chunk_index": chunk.chunk_index,
                "content": chunk.content,
                "token_count": chunk.token_count,
                "metadata": {
                    "filename": doc["filename"],
                    "file_type": doc["file_type"],
                    "chunk_index": chunk.chunk_index,
                },
                "embedding": emb,
            }
            for chunk, emb in zip(chunks, embeddings)
        ]

        db.replace_document_chunks(document_id, chunk_rows)
        updated = db.update_document_status(
            document_id,
            status="Completed",
            error_message=None,
            chunk_count=len(chunk_rows),
        )
        return DocumentProcessResponse(
            document=DocumentOut(**updated),
            skipped_reembedding=False,
            message=f"Successfully processed and indexed {len(chunk_rows)} chunks.",
        )
    except Exception as exc:
        db.update_document_status(
            document_id,
            status="Failed",
            error_message=str(exc)[:500],
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {exc}",
        )


@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
def delete_document(
    document_id: str,
    db: DatabaseRepository = Depends(get_db),
):
    deleted = db.delete_document(document_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return {"deleted": True, "id": document_id}
