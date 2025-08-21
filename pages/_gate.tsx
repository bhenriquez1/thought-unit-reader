// pages/_gate.tsx
import { useState } from "react";
import { useRouter } from "next/router";

export default function Gate() {
  const router = useRouter();
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const redirectTo = (router.query.r as string) || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/preview-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    if (res.ok) {
      router.replace(redirectTo);
    } else {
      setErr("Incorrect password");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow w-full max-w-sm">
        <h1 className="text-xl font-bold mb-4">Private Preview</h1>
        <label className="block text-sm mb-2">Password</label>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit(e);
            }
          }}
          className="w-full rounded px-3 py-2 text-black"
          autoFocus
        />
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
        <button
          type="submit"
          className="mt-4 w-full bg-yellow-500 text-black font-semibold py-2 rounded"
        >
          Enter
        </button>
        <p className="text-xs mt-3 opacity-70">Do not share this link. Site is no-index.</p>
      </form>
    </main>
  );
}
