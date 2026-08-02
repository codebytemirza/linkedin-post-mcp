import { useCallback, useEffect, useRef, useState } from "react";
import Login from "./components/Login";
import StatCards, { type Stat } from "./components/StatCards";
import AuthStatus from "./components/AuthStatus";
import PostsTable from "./components/PostsTable";
import LogTimeline from "./components/LogTimeline";
import { fetchDashboard, ApiError } from "./api";
import type { Dashboard } from "./types";

const TOKEN_KEY = "dashboard_token";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (tok: string, silent = false) => {
      if (!tok) return;
      if (!silent) setLoading(true);
      try {
        setData(await fetchDashboard(tok));
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setToken("");
          localStorage.removeItem(TOKEN_KEY);
          setError("Invalid token. Please sign in again.");
        } else {
          setError(e instanceof Error ? e.message : "Failed to load dashboard");
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleLogin = useCallback(
    (tok: string) => {
      localStorage.setItem(TOKEN_KEY, tok);
      setToken(tok);
      void load(tok);
    },
    [load]
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setData(null);
    setError(null);
  }, []);

  // Poll every 15s once authorized
  useEffect(() => {
    if (!token) return;
    void load(token, true);
    const id = setInterval(() => void load(token, true), 15000);
    return () => clearInterval(id);
  }, [token, load]);

  // Three.js Interactive Background Animation
  useEffect(() => {
    if (!canvasRef.current || !token) return;

    const THREE = (window as unknown as { THREE: typeof import("three") }).THREE;
    if (!THREE) return;

    const container = canvasRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 200;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const mainLight = new THREE.PointLight(0x0a66c2, 2.5, 50);
    mainLight.position.set(10, 10, 10);
    scene.add(mainLight);

    const coreGroup = new THREE.Group();

    const sphereGeom = new THREE.SphereGeometry(1.2, 24, 24);
    const sphereMat = new THREE.MeshPhongMaterial({
      color: 0x0a66c2,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
    });
    const coreSphere = new THREE.Mesh(sphereGeom, sphereMat);
    coreGroup.add(coreSphere);

    const innerCoreGeom = new THREE.IcosahedronGeometry(0.6, 2);
    const innerCoreMat = new THREE.MeshPhongMaterial({
      color: 0x004e99,
      emissive: 0x0a66c2,
      flatShading: true,
    });
    const innerCore = new THREE.Mesh(innerCoreGeom, innerCoreMat);
    coreGroup.add(innerCore);

    scene.add(coreGroup);

    camera.position.z = 4.5;

    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      coreGroup.rotation.y += 0.008;
      coreGroup.rotation.z += 0.003;
      innerCore.rotation.x -= 0.01;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      renderer.dispose();
    };
  }, [token]);

  if (!token) {
    return <Login onSubmit={handleLogin} />;
  }

  const stats: Stat[] = data
    ? [
        { label: "Posts", value: data.posts.length },
        { label: "Errors", value: data.errorCount },
        { label: "Events", value: data.logs.length },
        { label: "LinkedIn", value: data.health.linkedin ? "Up" : "Down" },
      ]
    : [];

  return (
    <div className="bg-[#f0f2f5] font-sans text-[#191c1e] min-h-screen">
      {/* TopNavBar */}
      <header className="fixed top-0 left-0 w-full h-16 z-50 flex items-center justify-between px-4 sm:px-8 bg-white/85 backdrop-blur-md border-b border-[#c1c6d4]/30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#004e99] rounded-xl flex items-center justify-center text-white shadow-md shadow-[#004e99]/20">
            <span className="material-symbols-outlined text-[22px]">hub</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-[#004e99]">
            MCP <span className="text-[#191c1e]">Intelligence</span>
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => void load(token)}
            disabled={loading}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-[#0a66c2] text-white font-semibold text-xs rounded-xl shadow-md shadow-[#0a66c2]/20 hover:bg-[#004e99] transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-[18px] ${
                loading ? "animate-spin" : ""
              }`}
            >
              refresh
            </span>
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-slate-100 text-[#5e5e5e] hover:text-[#ba1a1a] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </header>

      {/* Main Dashboard Content - Full Width Centered Container */}
      <main className="pt-24 pb-12 px-4 sm:px-8 max-w-7xl mx-auto space-y-6">
        {/* Global Alert Notification */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-800 text-sm font-semibold shadow-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-600">error</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-800 text-xs uppercase font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero Banner Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center bento-card p-6 sm:p-8 bg-gradient-to-br from-white/90 via-white/70 to-blue-50/30">
          <div className="lg:col-span-8 space-y-3">
            <span className="px-3 py-1 bg-[#004e99]/10 text-[#004e99] text-xs font-extrabold rounded-lg uppercase tracking-wider inline-block">
              MCP Node Operational
            </span>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#191c1e] leading-tight">
              MCP <span className="text-[#004e99]">INTELLIGENCE</span>
            </h1>
            <p className="text-xs sm:text-sm lg:text-base text-[#5e5e5e] max-w-xl leading-relaxed">
              Automated publication monitoring, bearer token auth, and real-time terminal logs for high-scale enterprise LinkedIn operations.
            </p>
          </div>
          <div className="lg:col-span-4 flex items-center justify-center">
            <div
              ref={canvasRef}
              className="w-full h-36 sm:h-44 flex items-center justify-center relative rounded-2xl bg-gradient-to-tr from-[#d6e3ff]/40 to-white/40 overflow-hidden"
            />
          </div>
        </section>

        {/* Dashboard Metrics & Bento Cards */}
        {data && (
          <>
            <StatCards
              stats={stats}
              redisHealth={data.health.redis}
              linkedinHealth={data.health.linkedin}
            />

            <AuthStatus data={data} />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-7">
                <PostsTable posts={data.posts} />
              </div>
              <div className="xl:col-span-5">
                <LogTimeline logs={data.logs} />
              </div>
            </div>
          </>
        )}

        {!data && loading && (
          <div className="flex flex-col items-center justify-center py-24 text-[#004e99]">
            <span className="material-symbols-outlined text-4xl animate-spin mb-3">
              progress_activity
            </span>
            <p className="text-sm font-bold">Loading dashboard metrics...</p>
          </div>
        )}
      </main>
    </div>
  );
}