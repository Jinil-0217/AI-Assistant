"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Plus, BookOpen, Cpu, Loader2, ChevronDown, ChevronUp, Filter, Trash2 } from "lucide-react";
import {
  ConversationItem,
  DocumentItem,
  MessageItem,
  deleteConversation,
  fetchChatHistory,
  fetchDocuments,
  sendChatQuery,
} from "@/lib/api";

function estimateTokensApprox(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function renderFormattedLine(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-indigo-300">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function FormattedMessage({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;
        if (trimmed.startsWith("### ")) {
          return <h4 key={idx} className="pt-1 text-sm font-bold text-zinc-100">{renderFormattedLine(trimmed.slice(4))}</h4>;
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={idx} className="flex gap-2 pl-1">
              <span className="font-bold text-indigo-400">•</span>
              <span>{renderFormattedLine(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderFormattedLine(line)}</p>;
      })}
    </div>
  );
}

const SUGGESTIONS = [
  "Summarize the key points from my documents",
  "What tech stack and vector database are used?",
  "How does chunking and token counting work?",
];

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [completedDocs, setCompletedDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    Promise.all([fetchChatHistory(), fetchDocuments(1, 50)])
      .then(([histRes, docRes]) => {
        setConversations(histRes.conversations);
        if (histRes.conversations.length > 0) {
          setActiveConvId(histRes.conversations[0].id);
          setMessages(histRes.conversations[0].messages);
        }
        setCompletedDocs(docRes.documents.filter((d) => d.status === "Completed"));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingHistory(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  async function handleDeleteChat(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete conversation");
    }
  }

  async function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    const tempUserMsg: MessageItem = {
      id: `temp-${Date.now()}`, conversation_id: activeConvId || "new", role: "user", content: trimmed, query_tokens: estimateTokensApprox(trimmed), context_tokens: 0, total_tokens: estimateTokensApprox(trimmed), sources: [], created_at: new Date().toISOString(), }; setMessages((prev) => [...prev, tempUserMsg]); setQuery("");  try { const docFilter = selectedDocIds.length > 0 ? selectedDocIds : undefined; const res = await sendChatQuery(trimmed, activeConvId || undefined, docFilter); const assistantMsg: MessageItem = { id: `ast-${Date.now()}`,
        conversation_id: res.conversation_id,
        role: "assistant",
        content: res.answer,
        query_tokens: res.token_usage.query_tokens,
        context_tokens: res.token_usage.context_tokens,
        total_tokens: res.token_usage.total_prompt_tokens,
        sources: res.sources,
        created_at: new Date().toISOString(),
      };
      setActiveConvId(res.conversation_id);
      setMessages((prev) => [...prev, assistantMsg]);

      const hist = await fetchChatHistory();
      setConversations(hist.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitText(query);
  }

  const approxQueryTokens = estimateTokensApprox(query);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4 md:flex-row">
      {/* History Sidebar */}
      <aside className="flex w-full shrink-0 flex-col gap-3 rounded-2xl border border-zinc-700/80 bg-zinc-900 p-3 shadow-sm md:w-64">
        <button
          onClick={() => {
            setActiveConvId(null);
            setMessages([]);
            setError(null);
          }}
          className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {loadingHistory ? (
            <p className="px-2 py-4 text-xs text-zinc-400">Loading history...</p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-4 text-xs text-zinc-400">No conversations yet.</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => {
                  setActiveConvId(conv.id);
                  setMessages(conv.messages);
                  setError(null);
                }}
                className={`btn-tactile group flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ${
                  activeConvId === conv.id
                    ? "border border-indigo-500/40 bg-indigo-500/15 font-semibold text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                <span className="truncate">{conv.title}</span>
                <button
                  type="button"
                  onClick={(e) => handleDeleteChat(e, conv.id)}
                  title="Delete chat"
                  className="shrink-0 rounded p-1 text-zinc-500 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Chat Panel */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-sm">
        {/* Document Filter Chip Bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/50 px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-200">
            <Filter className="h-3.5 w-3.5 text-indigo-400" />
            Scope:
          </span>
          <button
            type="button"
            onClick={() => setSelectedDocIds([])}
            className={`btn-tactile rounded-full border px-2.5 py-1 font-medium ${
              selectedDocIds.length === 0
                ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-200"
                : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            All ({completedDocs.length})
          </button>
          {completedDocs.map((doc) => {
            const active = selectedDocIds.includes(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggleDoc(doc.id)}
                className={`btn-tactile max-w-[180px] truncate rounded-full border px-2.5 py-1 font-medium ${
                  active
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-200"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {doc.filename}
              </button>
            );
          })}
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto bg-zinc-950/30 p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800">
                <BookOpen className="h-7 w-7 text-indigo-400" />
              </div>
              <p className="mt-4 text-base font-bold text-zinc-100">Ask anything about your knowledge base</p>
              <p className="mt-1 max-w-md text-xs text-zinc-400">
                Responses are grounded in your uploaded files with cosine similarity citations and token tracking.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submitText(s)}
                    className="btn-tactile rounded-full border border-zinc-700 bg-zinc-800 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-indigo-500/60 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isOpen = !!expandedSources[msg.id];
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-3xl rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${ msg.role === "user" ? "bg-indigo-600 text-white" : "border border-zinc-700/80 bg-zinc-900 text-zinc-200" }`} > {msg.role === "assistant" ? ( <FormattedMessage text={msg.content} /> ) : ( <div className="whitespace-pre-wrap">{msg.content}</div> )}  {msg.role === "assistant" && ( <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-2.5 text-[11px] text-zinc-400"> <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 font-medium text-zinc-300"> <Cpu className="h-3 w-3 text-indigo-400" /> Query: {msg.query_tokens} | Context: {msg.context_tokens} | Total: {msg.total_tokens} tok </span>  {msg.sources && msg.sources.length > 0 && ( <button type="button" onClick={() => setExpandedSources((prev) => ({ ...prev, [msg.id]: !prev[msg.id] })) } className="btn-tactile inline-flex items-center gap-1 font-semibold text-emerald-400 hover:underline" > {msg.sources.length} Source{msg.sources.length > 1 ? "s" : ""} {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} </button> )} </div> )}  {msg.role === "assistant" && isOpen && msg.sources && msg.sources.length > 0 && ( <div className="mt-2.5 space-y-2 border-t border-zinc-800 pt-2.5"> {msg.sources.map((src, idx) => ( <div key={`${src.document_id}-${src.chunk_index}-${idx}`}
                            className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between font-semibold text-zinc-100">
                              <span>
                                {src.filename} (Chunk #{src.chunk_index})
                              </span>
                              <span className="text-emerald-400">
                                {(src.similarity * 100).toFixed(1)}% match
                              </span>
                            </div>
                            <p className="mt-1 text-zinc-300">{src.snippet}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching pgvector & generating grounded response...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="border-t border-zinc-800 bg-zinc-900 p-3.5">
          <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800/80 p-1.5 focus-within:border-indigo-500">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your uploaded documents..."
              disabled={sending}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
            <span className="hidden text-[11px] font-medium text-zinc-400 sm:inline">
              ~{approxQueryTokens} tok
            </span>
            <button
              type="submit"
              disabled={sending || !query.trim()}
              className="btn-tactile inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
