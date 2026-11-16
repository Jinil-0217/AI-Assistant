const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type DocumentStatus = "Pending" | "Processing" | "Completed" | "Failed";

export interface DocumentItem {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  content_hash: string;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
}

export interface DocumentListResponse {
  documents: DocumentItem[];
  stats: DocumentStats;
  page: number;
  limit: number;
  total_count: number;
}

export interface SourceCitation {
  document_id: string;
  filename: string;
  chunk_index: number;
  similarity: number;
  snippet: string;
  token_count: number;
}

export interface TokenUsage {
  query_tokens: number;
  context_tokens: number;
  total_prompt_tokens: number;
  max_context_tokens: number;
  truncated_chunks: number;
}

export interface ChatResponse {
  conversation_id: string;
  answer: string;
  sources: SourceCitation[];
  token_usage: TokenUsage;
  no_relevant_context: boolean;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  query_tokens: number;
  context_tokens: number;
  total_tokens: number;
  sources: SourceCitation[];
  created_at: string;
}

export interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  messages: MessageItem[];
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function fetchDocuments(page = 1, limit = 20): Promise<DocumentListResponse> {
  const res = await fetch(`${API_URL}/documents?page=${page}&limit=${limit}`, { cache: "no-store" });
  return handleResponse<DocumentListResponse>(res);
}

export async function uploadDocument(file: File): Promise<DocumentItem> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/documents/upload`, {
    method: "POST",
    body: form,
  });
  return handleResponse<DocumentItem>(res);
}

export async function processDocument(id: string): Promise<{ document: DocumentItem; message: string }> {
  const res = await fetch(`${API_URL}/documents/${id}/process`, {
    method: "POST",
  });
  return handleResponse(res);
}

export async function deleteDocument(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_URL}/documents/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function sendChatQuery(
  query: string,
  conversationId?: string,
  documentIds?: string[]
): Promise<ChatResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        conversation_id: conversationId || null,
        document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
      }),
      signal: ctrl.signal,
    });
    return await handleResponse<ChatResponse>(res);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchChatHistory(): Promise<{ conversations: ConversationItem[] }> {
  const res = await fetch(`${API_URL}/chat/history`, { cache: "no-store" });
  return handleResponse(res);
}
export async function deleteConversation(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_URL}/chat/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}
