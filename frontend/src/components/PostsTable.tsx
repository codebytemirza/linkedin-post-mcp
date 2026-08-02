import type { LogEntry } from "../types";

export default function PostsTable({ posts }: { posts: LogEntry[] }) {
  return (
    <div className="bg-white border border-slate-200/80 shadow-lg rounded-3xl flex flex-col h-full min-h-[440px] overflow-hidden">
      {/* Table Card Header */}
      <div className="p-5 sm:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004e99] text-2xl">article</span>
            Recent Content
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Published LinkedIn posts synced live from MCP protocol node
          </p>
        </div>
        <span className="px-3 py-1 bg-[#004e99]/10 text-[#004e99] font-extrabold text-xs rounded-xl border border-[#004e99]/20 shrink-0">
          {posts.length} {posts.length === 1 ? "Post" : "Posts"}
        </span>
      </div>

      {/* Content Body / Table */}
      <div className="flex-1 overflow-hidden">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">post_add</span>
            <p className="text-sm font-bold text-slate-700">No LinkedIn posts recorded yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Use MCP tool <code className="bg-slate-100 text-[#004e99] px-1.5 py-0.5 rounded font-mono">create_post</code> or <code className="bg-slate-100 text-[#004e99] px-1.5 py-0.5 rounded font-mono">create_image_post</code> to publish.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600">
                  <th className="w-24 sm:w-28 px-4 sm:px-6 py-3.5 text-[11px] font-black uppercase tracking-wider">Type</th>
                  <th className="w-36 sm:w-44 px-4 sm:px-6 py-3.5 text-[11px] font-black uppercase tracking-wider">Timestamp</th>
                  <th className="px-4 sm:px-6 py-3.5 text-[11px] font-black uppercase tracking-wider">Post ID / URN</th>
                  <th className="w-28 sm:w-32 px-4 sm:px-6 py-3.5 text-[11px] font-black uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.map((p, i) => {
                  const isImage = p.action === "create_image_post";
                  const isError = p.level === "error";

                  return (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Type Badge */}
                      <td className="px-4 sm:px-6 py-4">
                        <span
                          className={`px-2.5 py-1 font-bold text-[11px] rounded-lg uppercase tracking-wide inline-flex items-center gap-1 ${
                            isImage
                              ? "bg-[#0a66c2]/10 text-[#0a66c2] border border-[#0a66c2]/20"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px]">
                            {isImage ? "image" : "title"}
                          </span>
                          {isImage ? "Image" : "Text"}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="px-4 sm:px-6 py-4 text-slate-900 font-semibold text-xs whitespace-nowrap">
                        {new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}
                      </td>

                      {/* Post ID URN (Truncated cleanly with title) */}
                      <td className="px-4 sm:px-6 py-4 font-mono text-xs text-slate-600 truncate">
                        {p.postId ? (
                          <code
                            title={p.postId}
                            className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[#004e99] font-bold inline-block max-w-full truncate align-middle"
                          >
                            {p.postId}
                          </code>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status Chip */}
                      <td className="px-4 sm:px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isError
                              ? "bg-rose-50 text-[#ba1a1a] border border-rose-200"
                              : "bg-emerald-50 text-[#005b31] border border-emerald-200"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[15px] fill-icon">
                            {isError ? "error" : "check_circle"}
                          </span>
                          {isError ? "ERROR" : "SUCCESS"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}