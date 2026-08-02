import { useEffect, useRef, useState, type FormEvent } from "react";

interface Props {
  onSubmit: (token: string) => void;
}

export default function Login({ onSubmit }: Props) {
  const [token, setToken] = useState("");
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Three.js floating code symbols background animation
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const THREE = (window as unknown as { THREE: typeof import("three") }).THREE;
    if (!THREE) return;

    const container = canvasContainerRef.current;
    container.innerHTML = "";

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const particleCount = 80;
    const symbols = ["*", "#", "{", "}", "[", "]", "+", "/", ">", "<"];
    const group = new THREE.Group();

    function createTextTexture(char: string) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      canvas.width = 64;
      canvas.height = 64;
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillRect(0, 0, 64, 64);
      ctx.font = "bold 44px Inter, sans-serif";
      ctx.fillStyle = "#0a66c2";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(char, 32, 32);
      return new THREE.CanvasTexture(canvas);
    }

    const textures = symbols
      .map((s) => createTextTexture(s))
      .filter((t): t is import("three").CanvasTexture => t !== null);

    for (let i = 0; i < particleCount; i++) {
      const texture = textures[Math.floor(Math.random() * textures.length)];
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: Math.random() * 0.45 + 0.15,
      });
      const sprite = new THREE.Sprite(material);

      sprite.position.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 10
      );

      const scale = Math.random() * 0.55 + 0.25;
      sprite.scale.set(scale, scale, 1);

      sprite.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.008,
          (Math.random() - 0.5) * 0.008,
          (Math.random() - 0.5) * 0.008
        ),
      };

      group.add(sprite);
    }

    scene.add(group);
    camera.position.z = 12;

    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);

      group.children.forEach((sprite) => {
        sprite.position.add(
          (sprite.userData as { velocity: import("three").Vector3 }).velocity
        );

        if (Math.abs(sprite.position.x) > 15) sprite.position.x *= -0.95;
        if (Math.abs(sprite.position.y) > 10) sprite.position.y *= -0.95;
        if (Math.abs(sprite.position.z) > 5) sprite.position.z *= -0.95;
      });

      group.rotation.y += 0.001;
      group.rotation.x += 0.0005;

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (token.trim()) {
      onSubmit(token.trim());
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090b10] p-6 relative overflow-hidden">
      {/* Three.js Floating Code Symbols Animation Container */}
      <div
        ref={canvasContainerRef}
        className="fixed inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Radial Gradient Glow */}
      <div className="absolute w-[600px] h-[600px] bg-[#004e99]/25 rounded-full blur-3xl pointer-events-none -top-32 -left-32" />
      <div className="absolute w-[500px] h-[500px] bg-[#0a66c2]/20 rounded-full blur-3xl pointer-events-none -bottom-32 -right-32" />

      {/* Dark Glass Login Card with High Contrast Text */}
      <div className="w-full max-w-md p-8 sm:p-10 shadow-2xl z-10 bg-[#161b22]/95 backdrop-blur-2xl border border-slate-700/80 rounded-3xl text-white">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#0a66c2] rounded-2xl flex items-center justify-center text-white shadow-xl shadow-[#0a66c2]/40 mb-4 border border-white/20">
            <span className="material-symbols-outlined text-3xl">hub</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            MCP <span className="text-[#38bdf8]">Intelligence</span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-widest text-[#38bdf8] mt-1 mb-3">
            LinkedIn Publisher Node
          </p>
          <p className="text-sm text-slate-300 max-w-xs leading-relaxed font-medium">
            Enter your MCP Bearer token to authorize node monitoring and tool analytics.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-200 mb-2">
              Bearer Token
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3.5 text-slate-400 text-xl">
                key
              </span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter MCP_AUTH_TOKEN"
                autoFocus
                required
                className="w-full pl-11 pr-4 py-3.5 bg-[#0d1117] border border-slate-600 rounded-xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-[#38bdf8] focus:ring-2 focus:ring-[#38bdf8]/30 transition-all shadow-inner"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 px-6 bg-[#0a66c2] hover:bg-[#004e99] text-white font-bold text-sm rounded-xl shadow-lg shadow-[#0a66c2]/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer border border-white/10"
          >
            <span className="material-symbols-outlined text-lg">login</span>
            Authenticate Node
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-700/60 text-center">
          <p className="text-xs text-slate-400 font-mono">
            Node.js 24+ · Streamable HTTP & stdio · Upstash Redis
          </p>
        </div>
      </div>
    </div>
  );
}