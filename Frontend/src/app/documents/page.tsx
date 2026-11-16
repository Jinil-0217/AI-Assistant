"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadCloud, Play, Trash2, RefreshCw, FileText } from "lucide-react";
import {
  DocumentItem,
  DocumentStatus,
  deleteDocument,
  fetchDocuments,
  processDocument,
  uploadDocument,
} from "@/lib/api";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Processing: "bg-sky-50 text-sky-700 border-sky-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Failed: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDocuments(1, 50);
      setDocuments(res.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function processUpload(file: File) {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const doc = await uploadDocument(file);
      setNotice(`Uploaded "${doc.filename}" (Pending). Click Process to index it.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await processUpload(file);
    e.target.value = "";
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processUpload(file);
  }

  async function handleProcess(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await processDocument(id);
      setNotice(res.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, filename: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await deleteDocument(id);
      setNotice(`Deleted "${filename}".`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">Documents</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Drop .txt or .md files below, then click Process to generate pgvector embeddings.
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="btn-tactile inline-flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 shadow-sm hover:bg-zinc-800/60 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-indigo-600 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`btn-tactile flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-zinc-900 p-7 text-center shadow-sm transition ${
          dragging ? "border-indigo-500 bg-indigo-50/50" : "border-zinc-700 hover:border-indigo-400"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-semibold text-zinc-100">
          {uploading ? "Uploading file..." : "Click to upload or drag & drop"}
        </p>
        <p className="mt-1 text-xs text-zinc-400">Supports .txt and .md files up to 5 MB</p>
        <input
          type="file"
          accept=".txt,.md"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-700">{notice}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-400">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm text-zinc-400">No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-700/80 bg-zinc-800/60 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-4 py-3.5">Filename</th>
                  <th className="px-4 py-3.5">Size</th>
                  <th className="px-4 py-3.5">Chunks</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Uploaded</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-zinc-800/70">
                    <td className="px-4 py-3.5 font-semibold text-zinc-100">
                      <div>{doc.filename}</div>
                      {doc.error_message && (
                        <div className="mt-0.5 text-xs font-normal text-rose-600">{doc.error_message}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400">{(doc.file_size / 1024).toFixed(1)} KB</td>
                    <td className="px-4 py-3.5 font-semibold text-indigo-600">{doc.chunk_count}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[doc.status]}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(doc.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleProcess(doc.id)}
                          disabled={busyId === doc.id}
                          className="btn-tactile inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          {busyId === doc.id ? "Working..." : doc.status === "Completed" ? "Re-check" : "Process"}
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          disabled={busyId === doc.id}
                          className="btn-tactile inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
