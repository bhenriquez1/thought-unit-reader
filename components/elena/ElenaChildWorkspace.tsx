// components/elena/ElenaChildWorkspace.tsx
// Minimal Elena Mode workspace — profile setup + personalized home screen.
// Uses getChildDisplayCopy() for all labels; never hard-codes "Elena".

import React, { useState, useEffect, useCallback } from "react";
import { getChildDisplayCopy } from "@/lib/elena/displayCopy";
import { saveChildProfile, loadChildProfile } from "@/lib/elena/idbStore";
import type { ChildProfile, ChildAgeRange, ReadingLevel } from "@/lib/elena/types";

const INTERESTS = [
  "Animals", "Space", "Dinosaurs", "Art", "Music", "Sports",
  "Science", "Math", "History", "Cooking", "Nature", "Technology",
];

const AGE_RANGES: { value: ChildAgeRange; label: string }[] = [
  { value: "3-4",  label: "3–4 years" },
  { value: "5-6",  label: "5–6 years" },
  { value: "7-8",  label: "7–8 years" },
  { value: "9-10", label: "9–10 years" },
  { value: "11-12",label: "11–12 years" },
];

/* ─── Setup form ────────────────────────────────────────────────────────────── */

interface SetupFormProps {
  onSave: (profile: ChildProfile) => void;
}

function SetupForm({ onSave }: SetupFormProps) {
  const [displayName,   setDisplayName]   = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [ageRange,      setAgeRange]      = useState<ChildAgeRange | "">("");
  const [interests,     setInterests]     = useState<string[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");

  function toggleInterest(interest: string) {
    setInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest],
    );
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setError("Please enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    const now     = new Date().toISOString();
    const profile: ChildProfile = {
      id:              `child-${Date.now()}`,
      displayName:     displayName.trim(),
      preferredName:   preferredName.trim() || undefined,
      ageRange:        (ageRange as ChildAgeRange) || undefined,
      interests,
      accessibilityPreferences: {
        highContrastMode: false,
        textToSpeech:     false,
        reducedMotion:    false,
        dyslexiaFont:     false,
      },
      parentAccountId: "local",
      createdAt:       now,
      updatedAt:       now,
    };
    await saveChildProfile(profile);
    onSave(profile);
    setSaving(false);
  }

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 flex items-start justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✨</div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to Elena Mode</h1>
          <p className="text-indigo-300">Let's set up a learning space. Tell us a bit about the learner.</p>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl p-6 space-y-5 shadow-xl">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setError(""); }}
              placeholder="e.g. Elena"
              maxLength={40}
              className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Preferred name */}
          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1.5">
              Nickname / preferred name <span className="text-white/40 text-xs">(optional)</span>
            </label>
            <input
              type="text"
              value={preferredName}
              onChange={e => setPreferredName(e.target.value)}
              placeholder="e.g. Ellie"
              maxLength={30}
              className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Age range */}
          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-1.5">
              Age range <span className="text-white/40 text-xs">(optional)</span>
            </label>
            <select
              value={ageRange}
              onChange={e => setAgeRange(e.target.value as ChildAgeRange | "")}
              className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="" className="bg-slate-900">Select age range…</option>
              {AGE_RANGES.map(a => (
                <option key={a.value} value={a.value} className="bg-slate-900">{a.label}</option>
              ))}
            </select>
          </div>

          {/* Interests */}
          <div>
            <label className="block text-sm font-medium text-indigo-200 mb-2">
              Interests <span className="text-white/40 text-xs">(pick any)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map(interest => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    interests.includes(interest)
                      ? "bg-indigo-500 text-white border border-indigo-400"
                      : "bg-white/10 text-white/70 border border-white/20 hover:bg-white/20"
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 font-semibold text-white transition-colors"
          >
            {saving ? "Setting up…" : "Create Learning Space →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Home screen ───────────────────────────────────────────────────────────── */

interface HomeScreenProps {
  profile:  ChildProfile;
  onReset:  () => void;
}

function HomeScreen({ profile, onReset }: HomeScreenProps) {
  const copy = getChildDisplayCopy(profile);

  const sections = [
    { icon: "📖", label: copy.readingLabel,   coming: false, desc: "Pick up where you left off or start something new." },
    { icon: "📚", label: copy.libraryLabel,   coming: true,  desc: "All books in one place." },
    { icon: "📊", label: copy.progressLabel,  coming: true,  desc: "See how far you've come." },
    { icon: "⭐", label: "Rewards",           coming: true,  desc: "Earn stars for every reading session." },
  ];

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 p-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{copy.workspaceTitle}</h1>
          <p className="text-indigo-300 mt-1">{copy.welcomeGreeting}</p>
          {profile.interests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.interests.map(i => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs">{i}</span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onReset}
          className="text-xs text-white/30 hover:text-white/60 transition-colors mt-1"
          title="Reset profile (testing)"
        >
          Reset profile
        </button>
      </div>

      {/* Reading space — placeholder */}
      <div className="mb-6 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">📖</span>
          <div>
            <p className="text-white font-semibold">Continue Reading</p>
            <p className="text-indigo-300 text-sm">No book loaded yet — open a PDF from the Reader to get started.</p>
          </div>
        </div>
        <button
          disabled
          className="mt-2 px-4 py-2 rounded-xl bg-white/10 text-white/50 text-sm cursor-not-allowed"
        >
          Open a book in the Reader →
        </button>
      </div>

      {/* Feature sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.slice(1).map(section => (
          <div
            key={section.label}
            className="rounded-2xl border border-white/10 bg-white/5 p-5 relative"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{section.icon}</span>
              <p className="text-white font-semibold">{section.label}</p>
              {section.coming && (
                <span className="ml-auto text-xs text-indigo-400/80 border border-indigo-400/30 rounded-full px-2 py-0.5">Soon</span>
              )}
            </div>
            <p className="text-slate-400 text-sm">{section.desc}</p>
          </div>
        ))}
      </div>

      {/* Version note */}
      <p className="mt-6 text-center text-white/20 text-xs">
        Elena Mode — groundwork preview · Full experience coming in a future release
      </p>
    </div>
  );
}

/* ─── Main workspace ────────────────────────────────────────────────────────── */

const STORAGE_KEY = "elena-active-profile-id";

export default function ElenaChildWorkspace() {
  const [profile,  setProfile]  = useState<ChildProfile | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) { setLoading(false); return; }
    loadChildProfile(savedId)
      .then(p => { setProfile(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = useCallback((p: ChildProfile) => {
    localStorage.setItem(STORAGE_KEY, p.id);
    setProfile(p);
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950">
        <div className="text-indigo-400 text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!profile) return <SetupForm onSave={handleSave} />;
  return <HomeScreen profile={profile} onReset={handleReset} />;
}
