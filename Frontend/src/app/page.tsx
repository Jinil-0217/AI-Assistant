"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, CheckCircle2, AlertTriangle, Clock, MessageSquare, ArrowRight } from "lucide-react";
import { DocumentStats, fetchDocuments } from "@/lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments(1, 10)
      .then((res) => setStats(res.stats))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">
          Knowledge Base Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Monitor indexed documents, spot processing errors, and launch grounded RAG chats.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Failed to load dashboard metrics: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Documents"
          value={loading ? "..." : String(stats?.total ?? 0)}
          icon={<FileText className="h-5 w-5 text-indigo-600" />}
          badgeBg="bg-indigo-50 border-indigo-200"
          valueColor="text-zinc-100"
        />
        <StatCard
          label="Completed"
          value={loading ? "..." : String(stats?.completed ?? 0)}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          badgeBg="bg-emerald-50 border-emerald-200"
          valueColor="text-emerald-700"
        />
        <StatCard
          label="Failed"
          value={loading ? "..." : String(stats?.failed ?? 0)}
          icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
          badgeBg="bg-rose-50 border-rose-200"
          valueColor="text-rose-700"
        />
        <StatCard
          label="Pending / Active"
          value={loading ? "..." : String((stats?.pending ?? 0) + (stats?.processing ?? 0))}
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          badgeBg="bg-amber-50 border-amber-200"
          valueColor="text-amber-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Link
          href="/documents"
          className="btn-tactile group rounded-2xl border border-zinc-700/80 bg-zinc-900 p-6 shadow-sm hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <FileText className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-600" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-zinc-100">Manage Documents</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Upload .txt or .md files, trigger chunking and vector indexing, or remove outdated files.
          </p>
        </Link>

        <Link
          href="/chat"
          className="btn-tactile group rounded-2xl border border-zinc-700/80 bg-zinc-900 p-6 shadow-sm hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <MessageSquare className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-indigo-600" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-zinc-100">Ask AI Assistant</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Filter by document, run Top-K cosine search, and inspect token usage and source citations.
          </p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  badgeBg,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  badgeBg: string;
  valueColor: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
        <div className={`rounded-lg border p-1.5 ${badgeBg}`}>{icon}</div>
      </div>
      <div className={`mt-3 text-3xl font-extrabold ${valueColor}`}>{value}</div>
    </div>
  );
}
