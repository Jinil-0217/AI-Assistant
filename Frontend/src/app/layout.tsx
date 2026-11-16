import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, FileText, MessageSquare, Sparkles } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI RAG Assistant",
  description: "RAG-powered document knowledge base assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased selection:bg-indigo-500/20 selection:text-indigo-950">
        <header className="sticky top-0 z-30 border-b border-zinc-700/80 bg-zinc-950/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="btn-tactile flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm">
                <Sparkles className="h-4 w-4 text-amber-300" />
              </div>
              <div className="leading-tight">
                <span className="block text-sm font-bold tracking-tight text-zinc-100">AI RAG Assistant</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                  Knowledge Base
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1 rounded-full border border-zinc-700/80 bg-zinc-800 p-1">
              <Link
                href="/"
                className="btn-tactile flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900 hover:text-white hover:shadow-sm"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600" />
                Dashboard
              </Link>
              <Link
                href="/documents"
                className="btn-tactile flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900 hover:text-white hover:shadow-sm"
              >
                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                Documents
              </Link>
              <Link
                href="/chat"
                className="btn-tactile flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-900 hover:text-white hover:shadow-sm"
              >
                <MessageSquare className="h-3.5 w-3.5 text-sky-600" />
                AI Chat
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl p-5 sm:p-8">{children}</main>
      </body>
    </html>
  );
}
