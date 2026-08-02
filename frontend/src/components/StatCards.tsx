import type { ReactNode } from "react";

export interface Stat {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: string;
}

export interface StatCardsProps {
  stats: Stat[];
  redisHealth?: boolean;
  linkedinHealth?: boolean;
}

export default function StatCards({ stats, redisHealth = true, linkedinHealth = true }: StatCardsProps) {
  const postsStat = stats.find((s) => s.label === "Posts")?.value ?? 0;
  const errorStat = stats.find((s) => s.label === "Errors")?.value ?? 0;
  const eventsStat = stats.find((s) => s.label === "Events")?.value ?? 0;

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Posts - Vertical Bento */}
      <div className="bento-card p-6 flex flex-col justify-between bg-gradient-to-b from-[#004e99]/5 to-transparent">
        <div>
          <div className="w-12 h-12 bg-[#0a66c2]/10 text-[#0a66c2] rounded-2xl flex items-center justify-center mb-4">
            <span className="material-symbols-outlined fill-icon text-3xl">article</span>
          </div>
          <h3 className="text-sm font-semibold text-[#5e5e5e]">Total Content Published</h3>
          <p className="text-4xl font-black mt-2 text-[#191c1e] tracking-tight">{postsStat}</p>
        </div>
        <div className="mt-6">
          <div className="flex items-center gap-1 text-[#005b31] font-bold text-xs mb-3">
            <span className="material-symbols-outlined text-sm">trending_up</span>
            <span>Live sync active</span>
          </div>
          <div className="h-16 flex items-end gap-1.5">
            <div className="flex-1 bg-[#0a66c2]/15 rounded-t-md h-1/2"></div>
            <div className="flex-1 bg-[#0a66c2]/25 rounded-t-md h-2/3"></div>
            <div className="flex-1 bg-[#0a66c2]/15 rounded-t-md h-1/3"></div>
            <div className="flex-1 bg-[#0a66c2]/40 rounded-t-md h-3/4"></div>
            <div className="flex-1 bg-[#0a66c2] rounded-t-md h-full"></div>
          </div>
        </div>
      </div>

      {/* LinkedIn API Status */}
      <div className={`bento-card p-6 flex flex-col justify-between ${linkedinHealth ? "bg-emerald-50/60 border-emerald-100/80" : "bg-rose-50/60 border-rose-100/80"}`}>
        <div className="flex justify-between items-start">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${linkedinHealth ? "bg-[#005b31]/10 text-[#005b31]" : "bg-[#ba1a1a]/10 text-[#ba1a1a]"}`}>
            <span className="material-symbols-outlined text-2xl fill-icon">
              {linkedinHealth ? "check_circle" : "error"}
            </span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${linkedinHealth ? "bg-[#005b31]/10 text-[#005b31]" : "bg-[#ba1a1a]/10 text-[#ba1a1a]"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${linkedinHealth ? "bg-[#005b31] animate-ping" : "bg-[#ba1a1a]"}`}></span>
            {linkedinHealth ? "Operational" : "Offline"}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-bold text-[#5e5e5e] uppercase tracking-widest mb-1">LinkedIn API</h3>
          <p className="text-2xl font-black text-[#191c1e]">
            {linkedinHealth ? "Connected" : "Disconnected"}
          </p>
        </div>
      </div>

      {/* Error Count / Total Failures */}
      <div className="bento-card p-6 flex flex-col justify-between bg-rose-50/50 border-rose-100">
        <div className="flex justify-between items-start">
          <div className="w-12 h-12 bg-[#ba1a1a]/10 text-[#ba1a1a] rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">warning</span>
          </div>
          <span className="text-[10px] font-bold text-[#ba1a1a] bg-[#ba1a1a]/10 px-2.5 py-1 rounded-full">
            Errors
          </span>
        </div>
        <div className="mt-4">
          <h3 className="text-xs font-bold text-rose-900/60 uppercase tracking-widest mb-1">Total Failures</h3>
          <p className="text-3xl font-black text-[#191c1e]">{errorStat}</p>
        </div>
      </div>

      {/* Infrastructure Health */}
      <div className="bento-card p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm text-[#191c1e] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#004e99] text-xl">database</span>
            Infrastructure
          </h3>
          <span className="text-[10px] font-extrabold text-[#5e5e5e] uppercase tracking-wider">
            {eventsStat} Events
          </span>
        </div>

        <div className="space-y-3.5 mt-2">
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-[#5e5e5e]">Redis Cache</span>
              <span className={redisHealth ? "text-[#005b31]" : "text-[#ba1a1a]"}>
                {redisHealth ? "99.9% Up" : "Offline"}
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${redisHealth ? "bg-[#005b31] w-[99.9%]" : "bg-[#ba1a1a] w-[20%]"}`} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-[#5e5e5e]">MCP Protocol Gateway</span>
              <span className="text-[#004e99]">Active</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#004e99] w-[100%] h-full rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}