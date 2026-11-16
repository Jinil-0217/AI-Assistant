from datetime import datetime, timezone
from typing import Any, Optional
from supabase import Client, create_client

from app.config import get_settings


class DatabaseRepository:
    def __init__(self, client: Optional[Client] = None):
        if client is not None:
            self.client = client
        else:
            settings = get_settings()
            if not settings.supabase_url or not settings.supabase_key:
                raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be configured.")
            self.client = create_client(settings.supabase_url, settings.supabase_key)

    def create_document(
        self,
        filename: str,
        file_type: str,
        file_size: int,
        content_hash: str,
        raw_content: str,
    ) -> dict[str, Any]:
        payload = {
            "filename": filename,
            "file_type": file_type,
            "file_size": file_size,
            "content_hash": content_hash,
            "raw_content": raw_content,
            "status": "Pending",
            "chunk_count": 0,
        }
        res = self.client.table("documents").insert(payload).execute()
        return res.data[0]

    def get_document_by_id(self, document_id: str) -> Optional[dict[str, Any]]:
        res = (
            self.client.table("documents")
            .select("id, filename, file_type, file_size, content_hash, raw_content, status, error_message, chunk_count, created_at, updated_at")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None

    def get_completed_by_hash(self, content_hash: str) -> Optional[dict[str, Any]]:
        res = (
            self.client.table("documents")
            .select("id, filename, file_type, file_size, content_hash, status, error_message, chunk_count, created_at, updated_at")
            .eq("content_hash", content_hash)
            .eq("status", "Completed")
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None

    def list_documents(self, page: int = 1, limit: int = 20) -> tuple[list[dict[str, Any]], dict[str, int], int]:
        offset = (page - 1) * limit
        res = (
            self.client.table("documents")
            .select("id, filename, file_type, file_size, content_hash, status, error_message, chunk_count, created_at, updated_at", count="exact")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        all_statuses = self.client.table("documents").select("status").execute()
        rows = all_statuses.data or []
        stats = {
            "total": len(rows),
            "completed": sum(1 for r in rows if r["status"] == "Completed"),
            "failed": sum(1 for r in rows if r["status"] == "Failed"),
            "pending": sum(1 for r in rows if r["status"] == "Pending"),
            "processing": sum(1 for r in rows if r["status"] == "Processing"),
        }
        total_count = res.count if res.count is not None else len(rows)
        return res.data or [], stats, total_count

    def update_document_status(
        self,
        document_id: str,
        status: str,
        error_message: Optional[str] = None,
        chunk_count: Optional[int] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": status,
            "error_message": error_message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if chunk_count is not None:
            payload["chunk_count"] = chunk_count
        res = self.client.table("documents").update(payload).eq("id", document_id).execute()
        return res.data[0]

    def delete_document(self, document_id: str) -> bool:
        res = self.client.table("documents").delete().eq("id", document_id).execute()
        return bool(res.data)

    def replace_document_chunks(self, document_id: str, chunks: list[dict[str, Any]]) -> None:
        self.client.table("document_chunks").delete().eq("document_id", document_id).execute()
        if chunks:
            self.client.table("document_chunks").insert(chunks).execute()

    def search_similar_chunks(
        self,
        query_embedding: list[float],
        match_threshold: float,
        match_count: int,
        document_ids: Optional[list[str]] = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "query_embedding": query_embedding,
            "match_threshold": match_threshold,
            "match_count": match_count,
        }
        if document_ids:
            params["filter_document_ids"] = document_ids
        res = self.client.rpc("match_document_chunks", params).execute()
        return res.data or []

    def create_conversation(self, title: str) -> dict[str, Any]:
        res = self.client.table("conversations").insert({"title": title[:80]}).execute()
        return res.data[0]

    def get_conversation(self, conversation_id: str) -> Optional[dict[str, Any]]:
        res = self.client.table("conversations").select("*").eq("id", conversation_id).limit(1).execute()
        return res.data[0] if res.data else None

    def delete_conversation(self, conversation_id: str) -> bool:
        res = self.client.table("conversations").delete().eq("id", conversation_id).execute()
        return bool(res.data)

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        query_tokens: int = 0,
        context_tokens: int = 0,
        total_tokens: int = 0,
        sources: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        payload = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "query_tokens": query_tokens,
            "context_tokens": context_tokens,
            "total_tokens": total_tokens,
            "sources": sources or [],
        }
        res = self.client.table("messages").insert(payload).execute()
        return res.data[0]

    def list_conversations_with_messages(self, limit: int = 20) -> list[dict[str, Any]]:
        convs = (
            self.client.table("conversations")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
        if not convs:
            return []
        conv_ids = [c["id"] for c in convs]
        msgs = (
            self.client.table("messages")
            .select("*")
            .in_("conversation_id", conv_ids)
            .order("created_at", desc=False)
            .execute()
        ).data or []
        by_conv: dict[str, list[dict[str, Any]]] = {cid: [] for cid in conv_ids}
        for m in msgs:
            by_conv.setdefault(m["conversation_id"], []).append(m)
        for c in convs:
            c["messages"] = by_conv.get(c["id"], [])
        return convs


def get_db() -> DatabaseRepository:
    return DatabaseRepository()
