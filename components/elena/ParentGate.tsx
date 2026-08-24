// components/elena/ParentGate.tsx
// P0 fix — the Parent dashboard used to open on a single unauthenticated tap
// from the child-visible workspace header. This overlay sits in front of it
// now: a 4-digit family PIN, created on first use and required on every
// subsequent open (lib/elena/parentGate.ts owns the hashing/storage — this
// component never sees a persisted PIN, only whatever the person just typed).

import React, { useEffect, useRef, useState } from "react";
import { hasParentPin, isValidPin, setParentPin, verifyParentPin } from "@/lib/elena/parentGate";

interface ParentGateProps {
  parentAccountId: string;
  onUnlock: () => void;
  onCancel: () => void;
}

type Mode = "loading" | "create" | "confirm" | "enter";

export default function ParentGate({ parentAccountId, onUnlock, onCancel }: ParentGateProps) {
  const [mode, setMode] = useState<Mode>("loading");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    hasParentPin(parentAccountId)
      .then((exists) => { if (alive) setMode(exists ? "enter" : "create"); })
      .catch(() => { if (alive) setMode("create"); });
    return () => { alive = false; };
  }, [parentAccountId]);

  useEffect(() => {
    if (mode !== "loading") inputRef.current?.focus();
  }, [mode]);

  function handlePinChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin) || busy) {
      if (!isValidPin(pin)) setError("Enter a 4-digit PIN.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        setFirstPin(pin);
        setPin("");
        setMode("confirm");
        return;
      }
      if (mode === "confirm") {
        if (pin !== firstPin) {
          setError("PINs didn't match — try again.");
          setPin("");
          setFirstPin("");
          setMode("create");
          return;
        }
        await setParentPin(parentAccountId, pin);
        onUnlock();
        return;
      }
      // mode === "enter"
      const ok = await verifyParentPin(parentAccountId, pin);
      if (ok) {
        onUnlock();
      } else {
        setError("Incorrect PIN.");
        setPin("");
      }
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "create" ? "Set a Parent PIN" :
    mode === "confirm" ? "Confirm your PIN" :
    "Enter Parent PIN";

  const subtext =
    mode === "create" ? "This keeps the Parent dashboard and settings private from the learner. Pick a 4-digit PIN." :
    mode === "confirm" ? "Type it once more to confirm." :
    "Enter your 4-digit PIN to open the Parent dashboard.";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-6 shadow-xl">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-2xl mb-1">🔒</div>
              <h1 className="text-white font-bold text-lg leading-tight">{heading}</h1>
              <p className="text-slate-400 text-xs mt-1">{subtext}</p>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-white transition-colors text-lg leading-none p-1.5"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>

          {mode === "loading" ? (
            <div className="text-center text-slate-500 text-sm py-6">Loading…</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                placeholder="••••"
                maxLength={4}
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-center text-2xl tracking-[0.5em] text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                aria-label="4-digit PIN"
              />
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
              <button
                type="submit"
                disabled={busy || pin.length !== 4}
                className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 font-semibold text-white transition-colors"
              >
                {busy ? "Please wait…" : mode === "enter" ? "Unlock" : mode === "create" ? "Continue" : "Confirm PIN"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
