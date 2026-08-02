import { useState } from "react";
import type { LogEntry } from "../types";

export default function LogTimeline({ logs }: { logs: LogEntry[] }) {
  const [filter, setFilter] = useState<"all" | "error" | "post" | "auth">("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const filteredLogs = logs.filter((l) => {
    if (filter === "error") return l.level === "error" || l.type === "error";
    if (filter === "post") return l.type === "post" || l.action.includes("post");
    if (filter === "auth") return l.type === "auth" || l.action.includes("auth");
    return true;
  });

  return (
    <div className="flex flex-col bg-[#0d1117] text-white overflow-hidden border border-[#30363d] shadow-2xl rounded-3xl h-full min-h-[500px]">
      {/* Terminal Header Bar */}
      <div className="px-5 py-4 bg-[#161b22] border-b border-[#30363d] flex flex-wrap items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-3">
          {/* Mac window dots */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
          </div>

          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#38bdf8] text-xl">terminal</span>
            <div>
              <h3 className="text-sm font-bold text-white leading-none">System Events</h3>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">mcp-stdout.log</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#0d1117] p-1 rounded-xl border border-[#30363d] text-[11px] font-mono">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === "all"
                ? "bg-[#1f6feb] text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            ALL ({logs.length})
          </button>
          <button
            onClick={() => setFilter("error")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === "error"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-slate-400 hover:text-rose-400"
            }`}
          >
            ERRORS
          </button>
          <button
            onClick={() => setFilter("post")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              filter === "post"
                ? "bg-[#1f6feb] text-white shadow-sm"
                : "text-slate-400 hover:text-[#38bdf8]"
            }`}
          >
            POSTS
          </button>
        </div>
      </div>

      {/* Terminal Log Output List */}
      <div className="p-5 overflow-y-auto max-h-[460px] custom-scrollbar flex-1 font-mono text-xs space-y-3 bg-[#0d1117]">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 text-slate-600">code_off</span>
            <p className="font-mono text-xs text-slate-400">No terminal output matching filter.</p>
          </div>
        ) : (
          filteredLogs.map((l, i) => {
            const isError = l.level === "error" || l.type === "error";
            const isExpanded = expandedIndex === i;

            return (
              <div
                key={i}
                className={`p-3.5 rounded-xl border transition-all ${
                  isError
                    ? "bg-rose-950/40 border-rose-800/60 text-rose-100"
                    : "bg-[#161b22] border-[#30363d] hover:border-slate-500/50 text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {/* Status Dot */}
                    <span className={`w-2.5 h-2.5 rounded-full ${isError ? "bg-rose-500" : "bg-emerald-400"}`} />

                    {/* Action Badge */}
                    <span
                      className={`px-2.5 py-0.5 rounded-md font-mono text-[11px] font-extrabold uppercase tracking-wider ${
                        isError
                          ? "bg-rose-500/30 text-rose-300 border border-rose-500/40"
                          : "bg-[#1f6feb]/25 text-[#38bdf8] border border-[#1f6feb]/40"
                      }`}
                    >
                      {l.action}
                    </span>

                    {/* Timestamp */}
                    <span className="text-slate-400 font-mono text-[11px]">
                      {new Date(l.ts).toLocaleTimeString()}
                    </span>
                  </div>

                  <button
                    onClick={() => setExpandedIndex(isExpanded ? null : i)}
                    className="text-[11px] font-mono text-slate-400 hover:text-white transition-colors cursor-pointer underline shrink-0"
                  >
                    {isExpanded ? "Collapse" : "JSON"}
                  </button>
                </div>

                {/* Log Detail */}
                {l.detail && (
                  <p className="mt-2 text-xs font-mono text-slate-300 leading-relaxed break-words pl-4 border-l-2 border-slate-700">
                    {l.detail}
                  </p>
                )}

                {/* Expandable JSON detail */}
                {isExpanded && (
                  <div className="mt-3 p-3 bg-[#090b10] rounded-lg border border-slate-700 overflow-x-auto text-[11px]">
                    <pre className="text-[#38bdf8] whitespace-pre-wrap font-mono">
                      {JSON.stringify(l, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Terminal Footer */}
      <div className="px-5 py-3 bg-[#161b22] border-t border-[#30363d] flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 font-bold">$</span>
          <span className="text-slate-300">mcp-server --transport=streamable-http</span>
        </div>
        <span className="text-[10px] text-slate-500">Upstash Redis</span>
      </div>
    </div>
  );
}