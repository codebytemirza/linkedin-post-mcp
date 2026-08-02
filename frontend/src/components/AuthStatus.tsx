import type { Dashboard } from "../types";

export default function AuthStatus({ data }: { data: Dashboard }) {
  const { auth, health } = data;
  const expired = auth.expiresAt ? auth.expiresAt < Date.now() : true;
  const initial = auth.name ? auth.name.charAt(0).toUpperCase() : "?";

  return (
    <div className="bento-card p-6 flex flex-col sm:flex-row items-center gap-6 bg-gradient-to-br from-white/90 to-slate-50/50">
      {/* Profile Avatar Container */}
      <div className="relative group">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-[#004e99] to-[#0a66c2] text-white font-extrabold text-3xl flex items-center justify-center border-4 border-white shadow-xl transition-transform group-hover:scale-105">
          {initial}
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#005b31] border-2 border-white rounded-2xl flex items-center justify-center shadow-lg">
          <span className="material-symbols-outlined text-white text-[14px] fill-icon">
            {auth.authorized ? "verified" : "help"}
          </span>
        </div>
      </div>

      {/* Account Info & Status Details */}
      <div className="flex-1 text-center sm:text-left space-y-3">
        <div>
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h2 className="text-2xl sm:text-3xl font-black text-[#191c1e]">
              {auth.name || "Not Authorized"}
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${auth.authorized ? "bg-emerald-100 text-[#005b31]" : "bg-rose-100 text-[#ba1a1a]"}`}>
              {auth.authorized ? "Authorized" : "Unauthorized"}
            </span>
          </div>
          <p className="text-sm font-medium text-[#5e5e5e] mt-0.5">
            {auth.email || "No email associated"}
          </p>
        </div>

        {/* Info Chips */}
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start text-xs font-semibold">
          <span className={`px-3 py-1 rounded-xl flex items-center gap-1.5 border ${expired ? "bg-rose-50 border-rose-200 text-[#ba1a1a]" : "bg-slate-100 border-slate-200 text-[#5e5e5e]"}`}>
            <span className="material-symbols-outlined text-sm">schedule</span>
            {auth.expiresAt ? `Expires: ${new Date(auth.expiresAt).toLocaleDateString()}` : "No Access Token"}
          </span>

          <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-[#5e5e5e] rounded-xl flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">autorenew</span>
            Refresh Token: {auth.hasRefreshToken ? "Yes" : "No"}
          </span>

          <span className={`px-3 py-1 rounded-xl flex items-center gap-1.5 border ${health.redis ? "bg-emerald-50 border-emerald-200 text-[#005b31]" : "bg-rose-50 border-rose-200 text-[#ba1a1a]"}`}>
            <span className="material-symbols-outlined text-sm">database</span>
            Redis: {health.redis ? "Up" : "Down"}
          </span>
        </div>

        {/* OAuth Connect CTA Button */}
        <div className="pt-1 flex justify-center sm:justify-start">
          <a
            href="/api/authorize"
            className="px-4 py-2 bg-[#0a66c2] hover:bg-[#004e99] text-white font-bold text-xs rounded-xl shadow-md shadow-[#0a66c2]/20 hover:shadow-lg transition-all flex items-center gap-2 active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">key</span>
            {auth.authorized ? "RECONNECT OAUTH" : "AUTHORIZE LINKEDIN OAUTH"}
          </a>
        </div>
      </div>
    </div>
  );
}