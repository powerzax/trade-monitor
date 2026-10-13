"use client";
import { useEffect, useState } from "react";

const LENGTH = 6;

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(code: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: code }) });
    if (res.ok) {
      window.location.replace("/");
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(j.error ?? "PIN ไม่ถูกต้อง");
    setShake(true);
    setTimeout(() => setShake(false), 450);
    setPin("");
    setBusy(false);
  }

  function press(d: string) {
    if (busy) return;
    if (d === "⌫") return setPin((p) => p.slice(0, -1));
    setPin((p) => {
      const next = (p + d).slice(0, LENGTH);
      if (next.length === LENGTH) submit(next);
      return next;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="card glow-ring relative w-full max-w-xs overflow-hidden rounded-3xl p-8 text-center">
        <span className="glow-ring-edge" />
        <div className="assistant-orb relative mx-auto grid h-14 w-14 place-items-center rounded-full text-xl"><span className="assistant-orb-ring" />📈</div>
        <h1 className="mt-4 text-xl font-bold bg-gradient-to-r from-white via-violet-200 to-violet-400 bg-clip-text text-transparent">Trade Monitor</h1>
        <p className="mt-1 text-sm text-slate-400">ใส่ PIN เพื่อเข้าใช้งาน</p>

        <div className={`mt-6 flex justify-center gap-3`} style={shake ? { animation: "tm-shake 0.4s" } : undefined}>
          {Array.from({ length: LENGTH }).map((_, i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-full border transition ${i < pin.length ? "border-violet-300 bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,0.9)]" : "border-white/25"}`} />
          ))}
        </div>
        <p className="mt-3 h-5 text-sm text-rose-300">{error}</p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) =>
            d === "" ? <span key={i} /> : (
              <button key={i} onClick={() => press(d)} disabled={busy} className="glass h-14 rounded-2xl text-xl font-medium text-white transition active:scale-95 hover:bg-violet-500/20 disabled:opacity-50">
                {d}
              </button>
            ),
          )}
        </div>
      </div>
      <style>{`@keyframes tm-shake { 0%,100% { transform: translateX(0) } 20%,60% { transform: translateX(-8px) } 40%,80% { transform: translateX(8px) } }`}</style>
    </main>
  );
}
