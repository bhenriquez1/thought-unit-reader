"use client";
// components/whiteboard/VisualSceneEngine.tsx
// Animated visual teaching engine.
// Builds concept diagrams progressively like an instructor drawing on a board:
// the full ghost structure is visible from the start, then each node/edge
// lights up one at a time with TTS narration.

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from "react";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import type { VisualSceneGraph } from "@/lib/whiteboard/visualSceneGraph";
import {
  claimSpeech, isSpeechStale,
  registerActiveAudio, notifySpeechEnd, notifySpeechError,
  stopAllSpeech,
} from "@/lib/speech/speechController";
import { synthesizeVoiceFromText } from "@/lib/tts";

// ── Tier config (Avrrio 5-tier language) ──────────────────────────────────────

type Tier = "master" | "step" | "decision" | "danger" | "pearl";

const CARD_TYPE_TIER: Record<string, Tier> = {
  must_know: "master", master_concepts: "master", why_this_matters: "master",
  mechanism: "step", procedure_flow: "step", formula_breakdown: "step", worked_example: "step",
  clinical_reasoning: "decision", decision_tree: "decision", pattern_recognition: "decision",
  exam_strategy: "decision", case_challenge: "decision",
  dat_trap: "danger", common_mistake: "danger", complication_risk: "danger",
  clinical_pearl: "pearl", memory_hook: "pearl", connection_map: "pearl",
  visual_mnemonic: "pearl", expert_thinking: "pearl", recall_questions: "pearl",
  surgeon_lens: "pearl", quick_review: "pearl", other: "pearl",
};

const TIER_STYLE: Record<Tier, { color: string; bg: string; border: string; label: string; icon: string }> = {
  master:   { color: "#fde047", bg: "rgba(253,224,71,0.11)",  border: "rgba(253,224,71,0.32)",  label: "MASTER",   icon: "⚡" },
  step:     { color: "#86efac", bg: "rgba(134,239,172,0.11)", border: "rgba(134,239,172,0.32)", label: "STEP",     icon: "⚙" },
  decision: { color: "#93c5fd", bg: "rgba(147,197,253,0.11)", border: "rgba(147,197,253,0.32)", label: "DECISION", icon: "🔍" },
  danger:   { color: "#fca5a5", bg: "rgba(252,165,165,0.13)", border: "rgba(252,165,165,0.36)", label: "DANGER",   icon: "⚠" },
  pearl:    { color: "#67e8f9", bg: "rgba(103,232,249,0.11)", border: "rgba(103,232,249,0.32)", label: "PEARL",    icon: "💎" },
};

const TYPE_LABELS: Record<string, string> = {
  must_know: "Must Know", master_concepts: "Master This", mechanism: "Mechanism",
  procedure_flow: "Procedure", formula_breakdown: "Formula", worked_example: "Example",
  clinical_reasoning: "Clinical Reasoning", decision_tree: "Decision Points",
  pattern_recognition: "Pattern", exam_strategy: "Exam Strategy",
  case_challenge: "Case", dat_trap: "Trap", common_mistake: "Mistake",
  complication_risk: "Risk", clinical_pearl: "Pearl", memory_hook: "Memory Hook",
  connection_map: "Connections", visual_mnemonic: "Mnemonic",
  expert_thinking: "Expert Thinking", recall_questions: "Quiz",
  surgeon_lens: "Surgeon View", why_this_matters: "Why It Matters",
  quick_review: "Review", other: "Note",
};

// ── Layout types ───────────────────────────────────────────────────────────────

type Grammar = "flow" | "comparison" | "hub-spoke" | "cycle" | "equation" | "text";

type LayoutNode = { id: string; label: string; x: number; y: number; w: number; h: number };
type LayoutEdge = { id: string; label?: string | null; x1: number; y1: number; x2: number; y2: number };
type SceneLayout = { nodes: LayoutNode[]; edges: LayoutEdge[]; svgW: number; svgH: number; grammar: Grammar };

type RevealItem = { kind: "node" | "edge"; id: string; narration: string };
type Chapter = { title: string; tier: Tier; typeLabel: string; layout: SceneLayout; reveals: RevealItem[] };

// Flat step: a single teaching beat across all chapters
type FlatStep = { chapterIdx: number; revealIdx: number; narration: string };

// ── Layout constants ───────────────────────────────────────────────────────────

const SVG_W   = 460;
const NODE_W  = 290;
const NODE_H  = 52;
const V_GAP   = 30;  // vertical gap between flow nodes (arrow zone)
const PAD     = 22;

// ── Layout algorithms ──────────────────────────────────────────────────────────

type RawNode = { id: string; label: string };
type RawEdge = { from: string; to: string; label?: string | null };

function buildFlowLayout(rn: RawNode[], re: RawEdge[]): SceneLayout {
  const n = rn.length;
  const svgH = PAD * 2 + n * NODE_H + Math.max(0, n - 1) * V_GAP;
  const sx = (SVG_W - NODE_W) / 2;

  const nodes: LayoutNode[] = rn.map((node, i) => ({
    id: node.id, label: node.label,
    x: sx, y: PAD + i * (NODE_H + V_GAP), w: NODE_W, h: NODE_H,
  }));
  const nm = new Map(nodes.map(nd => [nd.id, nd]));

  const edges: LayoutEdge[] = re.flatMap((e, i) => {
    const s = nm.get(e.from); const t = nm.get(e.to);
    if (!s || !t) return [];
    return [{ id: `e${i}`, label: e.label, x1: s.x + s.w / 2, y1: s.y + s.h, x2: t.x + t.w / 2, y2: t.y }];
  });

  return { nodes, edges, svgW: SVG_W, svgH, grammar: "flow" };
}

function buildComparisonLayout(rn: RawNode[], re: RawEdge[]): SceneLayout {
  if (rn.length < 2) return buildFlowLayout(rn, re);

  const COL_W = 200, COL_H = 52, ROW_H = 68;
  const lx = 20, rx = 242;

  const leftParent = rn[0].id;
  const rightParent = rn[1].id;
  const leftChildIds  = new Set(re.filter(e => e.from === leftParent).map(e => e.to));
  const rightChildIds = new Set(re.filter(e => e.from === rightParent).map(e => e.to));

  const nodes: LayoutNode[] = [
    { id: rn[0].id, label: rn[0].label, x: lx, y: PAD, w: COL_W, h: COL_H },
    { id: rn[1].id, label: rn[1].label, x: rx, y: PAD, w: COL_W, h: COL_H },
  ];
  let lr = 0, rr = 0;
  for (const node of rn.slice(2)) {
    const isRight = rightChildIds.has(node.id) && !leftChildIds.has(node.id);
    if (isRight) {
      nodes.push({ id: node.id, label: node.label, x: rx, y: PAD + COL_H + 12 + rr * ROW_H, w: COL_W, h: COL_H });
      rr++;
    } else {
      nodes.push({ id: node.id, label: node.label, x: lx, y: PAD + COL_H + 12 + lr * ROW_H, w: COL_W, h: COL_H });
      lr++;
    }
  }

  const maxRows = Math.max(lr, rr, 1);
  const svgH = PAD * 2 + COL_H + 12 + maxRows * ROW_H;
  const nm = new Map(nodes.map(nd => [nd.id, nd]));

  const edges: LayoutEdge[] = re.flatMap((e, i) => {
    const s = nm.get(e.from); const t = nm.get(e.to);
    if (!s || !t) return [];
    return [{ id: `e${i}`, label: e.label, x1: s.x + s.w / 2, y1: s.y + s.h, x2: t.x + t.w / 2, y2: t.y }];
  });

  return { nodes, edges, svgW: SVG_W, svgH, grammar: "comparison" };
}

function buildHubSpokeLayout(rn: RawNode[], re: RawEdge[]): SceneLayout {
  if (rn.length < 2) return buildFlowLayout(rn, re);

  const W = 460, H = 400;
  const cx = W / 2, cy = 195;
  const HW = 200, HH = 52;
  const SW = 160, SH = 48;
  const R = 148;

  const hub: LayoutNode = { id: rn[0].id, label: rn[0].label, x: cx - HW / 2, y: cy - HH / 2, w: HW, h: HH };
  const spokes = rn.slice(1);
  const step = (2 * Math.PI) / spokes.length;
  const start = -Math.PI / 2;

  const spokeNodes: LayoutNode[] = spokes.map((node, i) => {
    const a = start + i * step;
    const ncx = cx + R * Math.cos(a), ncy = cy + R * Math.sin(a);
    return { id: node.id, label: node.label, x: ncx - SW / 2, y: ncy - SH / 2, w: SW, h: SH };
  });

  const nodes = [hub, ...spokeNodes];
  const nm = new Map(nodes.map(nd => [nd.id, nd]));

  const edges: LayoutEdge[] = spokes.map((spoke, i) => {
    const s = nm.get(rn[0].id)!;
    const t = nm.get(spoke.id);
    if (!t) return null;
    const a = start + i * step;
    const hcx = s.x + s.w / 2, hcy = s.y + s.h / 2;
    return {
      id: `e${i}`, label: undefined as string | null | undefined,
      x1: hcx + (s.w / 2 + 4) * Math.cos(a), y1: hcy + (s.h / 2 + 4) * Math.sin(a),
      x2: t.x + t.w / 2 - (SW / 2 + 4) * Math.cos(a), y2: t.y + t.h / 2 - (SH / 2 + 4) * Math.sin(a),
    };
  }).filter(Boolean) as LayoutEdge[];

  return { nodes, edges, svgW: W, svgH: H, grammar: "hub-spoke" };
}

function buildEquationLayout(rn: RawNode[]): SceneLayout {
  const EW = 380, EH = 52;
  const sx = (SVG_W - EW) / 2;
  const nodes: LayoutNode[] = rn.map((node, i) => ({
    id: node.id, label: node.label,
    x: sx, y: PAD + i * (EH + 14), w: EW, h: EH,
  }));
  const svgH = PAD * 2 + rn.length * (EH + 14);
  return { nodes, edges: [], svgW: SVG_W, svgH, grammar: "equation" };
}

function buildSceneLayout(card: NoteCard, domainGrammar?: string): SceneLayout {
  if (!card.visual || card.visual.nodes.length === 0)
    return { nodes: [], edges: [], svgW: SVG_W, svgH: 0, grammar: "text" };

  const rn: RawNode[] = card.visual.nodes.map(n => ({ id: n.id, label: n.label }));
  const re: RawEdge[] = card.visual.arrows.map(a => ({ from: a.from, to: a.to, label: a.label }));

  // Domain grammar hint overrides the card's own drawType for structural layouts:
  // anatomy/case-map → hub-spoke (central concept + radial relationships)
  // worked-solution/timeline/pathway → flow (sequential vertical chain)
  // system-diagram → hub-spoke when many nodes, otherwise flow
  if (domainGrammar && rn.length >= 3) {
    if (domainGrammar === "anatomy" || domainGrammar === "case-map")
      return buildHubSpokeLayout(rn, re);
    if (domainGrammar === "system-diagram" && rn.length >= 4)
      return buildHubSpokeLayout(rn, re);
  }

  switch (card.visual.drawType) {
    case "flow":
    case "timeline":
      return buildFlowLayout(rn, re);
    case "comparison":
      return buildComparisonLayout(rn, re);
    case "anatomy":
    case "table":
    case "graph":
      return rn.length >= 3 ? buildHubSpokeLayout(rn, re) : buildFlowLayout(rn, re);
    case "cycle":
      return buildFlowLayout(rn, re); // cycle shown as vertical chain
    case "equation":
      return buildEquationLayout(rn);
    default:
      return buildFlowLayout(rn, re);
  }
}

// ── Narration splitter ─────────────────────────────────────────────────────────

function splitNarrations(body: string, count: number): string[] {
  if (count === 0) return [];
  const sentences = body.match(/[^.!?\n]+[.!?]+/g) ?? [body];
  const result: string[] = [];
  const chunk = Math.ceil(sentences.length / count);
  for (let i = 0; i < count; i++)
    result.push(sentences.slice(i * chunk, (i + 1) * chunk).join(" ").trim());
  return result;
}

// ── Chapter builder ────────────────────────────────────────────────────────────

function buildChapters(cards: NoteCard[], domainGrammar?: string): Chapter[] {
  return cards.map(card => {
    const tier = CARD_TYPE_TIER[card.type] ?? "pearl";
    const layout = buildSceneLayout(card, domainGrammar);
    const n = layout.nodes.length;
    const nars = splitNarrations(card.body, Math.max(n, 1));

    const reveals: RevealItem[] = [
      ...layout.nodes.map((node, i) => ({ kind: "node" as const, id: node.id, narration: nars[i] ?? "" })),
      ...layout.edges.map(edge => ({ kind: "edge" as const, id: edge.id, narration: "" })),
    ];
    if (n === 0) reveals.push({ kind: "node", id: "__body__", narration: card.body });

    return { title: card.title, tier, typeLabel: TYPE_LABELS[card.type] ?? card.type, layout, reveals };
  });
}

// ── SVG subcomponents ──────────────────────────────────────────────────────────

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L0,6 L9,3 Z" fill={color} />
    </marker>
  );
}

function NodeRect({
  node, tier, revealed, active, isEq, onClick,
}: {
  node: LayoutNode; tier: Tier; revealed: boolean; active: boolean; isEq: boolean; onClick?: () => void;
}) {
  const s = TIER_STYLE[tier];
  const label = node.label.length > 40 ? node.label.slice(0, 38) + "…" : node.label;

  return (
    <g style={{ cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      {/* Ghost rect — always visible at low opacity */}
      <rect
        x={node.x} y={node.y} width={node.w} height={node.h} rx={10}
        fill="rgba(255,255,255,0.025)"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={1}
        strokeDasharray={revealed ? "none" : "4 3"}
      />
      {/* Revealed fill */}
      <rect
        x={node.x} y={node.y} width={node.w} height={node.h} rx={10}
        fill={s.bg}
        stroke={active ? s.color : s.border}
        strokeWidth={active ? 2 : 1.2}
        style={{
          opacity: revealed ? 1 : 0,
          transition: "opacity 0.38s ease",
          filter: active ? `drop-shadow(0 0 10px ${s.color}55)` : "none",
        }}
      />
      {/* Active pulse halo */}
      {active && revealed && (
        <rect
          x={node.x - 4} y={node.y - 4} width={node.w + 8} height={node.h + 8} rx={13}
          fill="none" stroke={s.color} strokeWidth={1} opacity={0.25}
          style={{ animation: "vse-pulse 1.4s ease-out infinite" }}
        />
      )}
      {/* Label */}
      <text
        x={node.x + node.w / 2} y={node.y + node.h / 2}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={isEq ? 13 : 12}
        fontFamily={isEq ? "monospace" : "system-ui,sans-serif"}
        fontWeight={600}
        fill={revealed ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.16)"}
        style={{ transition: "fill 0.38s ease", userSelect: "none", pointerEvents: "none" }}
      >
        {label}
      </text>
    </g>
  );
}

function EdgePath({ edge, tier, revealed }: { edge: LayoutEdge; tier: Tier; revealed: boolean }) {
  const s = TIER_STYLE[tier];
  const mx = (edge.x1 + edge.x2) / 2, my = (edge.y1 + edge.y2) / 2;
  const d = `M ${edge.x1},${edge.y1} C ${edge.x1},${my} ${edge.x2},${my} ${edge.x2},${edge.y2}`;
  return (
    <g>
      <path d={d} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1.5} strokeDasharray="3 3" />
      {revealed && (
        <path
          d={d} fill="none" stroke={s.color} strokeWidth={1.8} opacity={0.6}
          markerEnd={`url(#arr-${tier})`}
          style={{ transition: "opacity 0.3s ease" }}
        />
      )}
      {edge.label && revealed && (
        <text x={mx} y={my - 7} textAnchor="middle" fontSize={9.5} fill="rgba(255,255,255,0.38)" style={{ userSelect: "none" }}>
          {edge.label}
        </text>
      )}
    </g>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  const capped = Math.min(total, 14);
  if (capped <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1">
      {Array.from({ length: capped }, (_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 18 : 5,
            height: 5,
            borderRadius: 9999,
            background: i === current ? "#93c5fd" : "rgba(255,255,255,0.16)",
            transition: "all 0.22s ease",
          }}
        />
      ))}
      {total > 14 && <span className="text-[10px] text-white/28 ml-1">{current + 1}/{total}</span>}
    </div>
  );
}

// ── Voice helper ───────────────────────────────────────────────────────────────

type VoiceId = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
function storedVoice(): VoiceId {
  if (typeof window === "undefined") return "alloy";
  try {
    const v = localStorage.getItem("speech_voice");
    if (v && ["alloy","echo","fable","onyx","nova","shimmer"].includes(v)) return v as VoiceId;
  } catch { /**/ }
  return "alloy";
}

// ── Main component ─────────────────────────────────────────────────────────────

const SPEECH_OWNER = "whiteboard" as const;
const STEP_MS = 2600; // base ms per step at 1x speed

interface Props {
  noteCards: NoteCard[];
  pageTitle?: string | null;
  onAnchorClick?: (nodeId: string) => void;
  /** Preferred layout grammar from the active annotation pack.
   *  Biases buildSceneLayout toward the domain's natural visual form
   *  (anatomy → hub-spoke, pathway → flow, timeline → flow, worked-solution → flow). */
  whiteboardGrammar?: string;
  /** Phase 1: typed scene graph — accepted but not yet consumed (Phase 2 wires it). */
  vsg?: VisualSceneGraph;
}

export default function VisualSceneEngine({ noteCards, pageTitle, onAnchorClick, whiteboardGrammar }: Props) {
  const chapters = useMemo(() => buildChapters(noteCards, whiteboardGrammar), [noteCards, whiteboardGrammar]);

  // Flat step sequence across all chapters
  const flatSteps = useMemo<FlatStep[]>(() => {
    const steps: FlatStep[] = [];
    chapters.forEach((ch, ci) => {
      steps.push({ chapterIdx: ci, revealIdx: -1, narration: ch.title }); // intro
      ch.reveals.forEach((_, ri) => {
        steps.push({ chapterIdx: ci, revealIdx: ri, narration: ch.reveals[ri].narration });
      });
    });
    return steps;
  }, [chapters]);

  const [flatIdx, setFlatIdx]         = useState(0);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [narEnabled, setNarEnabled]   = useState(true);
  const [speed, setSpeed]             = useState(1.0);
  const [narState, setNarState]       = useState<"idle" | "loading" | "playing">("idle");

  const narTokenRef    = useRef(-1);
  const narAudioRef    = useRef<HTMLAudioElement | null>(null);
  const narBlobUrlRef  = useRef<string | null>(null);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef     = useRef(false);
  const flatIdxRef     = useRef(flatIdx);
  const flatLenRef     = useRef(flatSteps.length);

  useEffect(() => { playingRef.current  = isPlaying; },    [isPlaying]);
  useEffect(() => { flatIdxRef.current  = flatIdx; },      [flatIdx]);
  useEffect(() => { flatLenRef.current  = flatSteps.length; }, [flatSteps.length]);

  // Reset when noteCards change
  useEffect(() => {
    setFlatIdx(0);
    setIsPlaying(false);
    stopNarrationFn();
  }, [noteCards]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived from flatIdx
  const current      = flatSteps[flatIdx];
  const chapIdx      = current?.chapterIdx ?? 0;
  const revealIdx    = current?.revealIdx ?? -1;
  const chapter      = chapters[chapIdx];
  const reveals      = chapter?.reveals ?? [];

  const revealedNodeIds = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i <= revealIdx && i < reveals.length; i++)
      if (reveals[i].kind === "node") s.add(reveals[i].id);
    return s;
  }, [reveals, revealIdx]);

  const revealedEdgeIds = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i <= revealIdx && i < reveals.length; i++)
      if (reveals[i].kind === "edge") s.add(reveals[i].id);
    return s;
  }, [reveals, revealIdx]);

  const activeNodeId = (revealIdx >= 0 && reveals[revealIdx]?.kind === "node")
    ? reveals[revealIdx].id : null;

  // ── Narration stop ─────────────────────────────────────────────────────────

  function stopNarrationFn() {
    stopAllSpeech("vse-stop");
    narAudioRef.current = null;
    if (narBlobUrlRef.current) { URL.revokeObjectURL(narBlobUrlRef.current); narBlobUrlRef.current = null; }
    setNarState("idle");
  }

  // ── Advance ────────────────────────────────────────────────────────────────

  const advance = useCallback(() => {
    const next = flatIdxRef.current + 1;
    if (next >= flatLenRef.current) {
      setIsPlaying(false);
      return;
    }
    setFlatIdx(next);
  }, []);

  // ── Narrate ────────────────────────────────────────────────────────────────

  const narrateStep = useCallback(async (text: string) => {
    if (!text.trim()) { if (playingRef.current) advance(); return; }
    setNarState("loading");
    const token = claimSpeech(SPEECH_OWNER);
    narTokenRef.current = token;
    try {
      const voice = storedVoice();
      const blob = await synthesizeVoiceFromText(text, { voice });
      if (isSpeechStale(token)) { setNarState("idle"); return; }
      if (!blob) { setNarState("idle"); if (playingRef.current) advance(); return; }
      const url = URL.createObjectURL(blob);
      narBlobUrlRef.current = url;
      const audio = new Audio(url);
      narAudioRef.current = audio;
      registerActiveAudio(token, audio);
      setNarState("playing");
      audio.playbackRate = speed;
      audio.play();
      audio.onended  = () => { notifySpeechEnd(token, SPEECH_OWNER);                    setNarState("idle"); if (playingRef.current) advance(); };
      audio.onerror  = () => { notifySpeechError(token, SPEECH_OWNER, "TTS error");     setNarState("idle"); if (playingRef.current) advance(); };
    } catch {
      notifySpeechError(token, SPEECH_OWNER, "TTS synthesis failed");
      setNarState("idle");
      if (playingRef.current) advance();
    }
  }, [speed, advance]);

  // ── Auto-advance timer (narration off) ────────────────────────────────────

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!isPlaying || narEnabled) return;
    timerRef.current = setTimeout(advance, STEP_MS / speed);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, narEnabled, flatIdx, speed, advance]);

  // ── Narrate on step change ─────────────────────────────────────────────────
  // Fires when play starts or flatIdx advances.

  const lastNarratedIdxRef = useRef(-2); // -2 = never
  useEffect(() => {
    if (!isPlaying || !narEnabled) return;
    if (flatIdx === lastNarratedIdxRef.current) return; // guard double-fire
    lastNarratedIdxRef.current = flatIdx;
    const text = flatSteps[flatIdx]?.narration ?? "";
    narrateStep(text);
  }, [isPlaying, narEnabled, flatIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ───────────────────────────────────────────────────────────────

  function handlePlay() {
    if (isPlaying) {
      setIsPlaying(false);
      stopNarrationFn();
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      const atEnd = flatIdx >= flatSteps.length - 1;
      if (atEnd) { setFlatIdx(0); lastNarratedIdxRef.current = -2; }
      setIsPlaying(true);
    }
  }

  function handlePrev() {
    stopNarrationFn();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
    lastNarratedIdxRef.current = -2;
    setFlatIdx(i => Math.max(0, i - 1));
  }

  function handleNext() {
    stopNarrationFn();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
    lastNarratedIdxRef.current = -2;
    setFlatIdx(i => Math.min(i + 1, flatSteps.length - 1));
  }

  function handleRestart() {
    stopNarrationFn();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
    lastNarratedIdxRef.current = -2;
    setFlatIdx(0);
  }

  function handleChapterJump(ci: number) {
    stopNarrationFn();
    setIsPlaying(false);
    lastNarratedIdxRef.current = -2;
    const idx = flatSteps.findIndex(s => s.chapterIdx === ci && s.revealIdx === -1);
    if (idx >= 0) setFlatIdx(idx);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (chapters.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-slate-500">No teaching cards available.</div>;
  }
  if (!chapter) return null;

  const tier   = chapter.tier;
  const style  = TIER_STYLE[tier];
  const layout = chapter.layout;
  const hasVis = layout.grammar !== "text" && layout.nodes.length > 0;
  const isEq   = layout.grammar === "equation";
  const atEnd  = flatIdx >= flatSteps.length - 1;
  const atStart = flatIdx === 0;

  const grammarLabel: Record<Grammar, string> = {
    flow: "⚙ flow", comparison: "⇄ comparison", "hub-spoke": "◉ concept map",
    cycle: "↺ cycle", equation: "∑ formula", text: "📄 text",
  };

  const narText = flatSteps[flatIdx]?.narration ?? "";

  return (
    <div className="flex flex-col gap-3 px-1 pb-2">

      {/* CSS keyframe for active pulse */}
      <style>{`
        @keyframes vse-pulse {
          0%   { opacity:.35; transform:scale(1); }
          60%  { opacity:.08; transform:scale(1.05); }
          100% { opacity:0;   transform:scale(1.08); }
        }
      `}</style>

      {/* Chapter tabs */}
      {chapters.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {chapters.map((ch, i) => {
            const cs = TIER_STYLE[ch.tier];
            const active = i === chapIdx;
            return (
              <button
                key={i} onClick={() => handleChapterJump(i)}
                className="text-[10px] font-bold px-2.5 py-1 rounded-md transition-all"
                style={{
                  background: active ? cs.bg : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? cs.border : "rgba(255,255,255,0.08)"}`,
                  color: active ? cs.color : "rgba(255,255,255,0.38)",
                }}
              >
                {i + 1}. {ch.title.length > 22 ? ch.title.slice(0, 20) + "…" : ch.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Chapter header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10px] font-black uppercase tracking-[0.12em] px-2.5 py-1 rounded-md"
          style={{ color: style.color, background: style.bg, border: `1px solid ${style.border}` }}
        >
          {style.icon} {chapter.typeLabel}
        </span>
        {hasVis && (
          <span className="text-[10px] text-white/28 font-mono">{grammarLabel[layout.grammar]}</span>
        )}
      </div>

      {/* Title */}
      <div className="text-[17px] font-bold text-white/90 leading-snug">
        {chapter.title}
      </div>

      {/* ── SVG diagram canvas ─────────────────────────────────────────── */}
      {hasVis && (
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ background: "rgba(0,0,0,0.38)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <svg
            viewBox={`0 0 ${layout.svgW} ${layout.svgH}`}
            width="100%"
            style={{ display: "block", maxHeight: 390 }}
          >
            <defs>
              {(["master","step","decision","danger","pearl"] as Tier[]).map(t => (
                <ArrowMarker key={t} id={`arr-${t}`} color={TIER_STYLE[t].color} />
              ))}
              {/* Comparison divider */}
              {layout.grammar === "comparison" && (
                <line id="divider" x1={layout.svgW/2} y1={PAD} x2={layout.svgW/2} y2={layout.svgH - PAD}
                  stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
              )}
            </defs>
            {layout.grammar === "comparison" && (
              <line x1={layout.svgW/2} y1={PAD} x2={layout.svgW/2} y2={layout.svgH - PAD}
                stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            )}
            {/* Edges (under nodes) */}
            {layout.edges.map(edge => (
              <EdgePath key={edge.id} edge={edge} tier={tier} revealed={revealedEdgeIds.has(edge.id)} />
            ))}
            {/* Nodes */}
            {layout.nodes.map(node => (
              <NodeRect
                key={node.id} node={node} tier={tier}
                revealed={revealedNodeIds.has(node.id)}
                active={node.id === activeNodeId}
                isEq={isEq}
                onClick={onAnchorClick ? () => onAnchorClick(node.id) : undefined}
              />
            ))}
          </svg>

          {/* Step counter overlay */}
          {revealIdx >= 0 && (
            <div className="absolute bottom-2 right-3 text-[10px] text-white/20 font-mono">
              {revealIdx + 1}/{reveals.length}
            </div>
          )}
        </div>
      )}

      {/* ── Narration text ──────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 rounded-xl text-[13px] leading-[1.85] min-h-[56px]"
        style={{
          background: "rgba(0,0,0,0.22)",
          border: `1px solid ${style.border}`,
          color: "rgba(203,213,225,0.84)",
        }}
      >
        {revealIdx === -1 && !isPlaying ? (
          <span className="italic text-white/35">→ Press Play to begin the visual lesson</span>
        ) : (
          narText || chapter.reveals[revealIdx]?.narration || ""
        )}
      </div>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        {/* Progress dots */}
        <ProgressDots total={reveals.length} current={Math.max(0, revealIdx)} />

        {/* Button row */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {/* Restart */}
          <button
            onClick={handleRestart} title="Restart lesson"
            className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold transition-colors"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}
          >
            ↺
          </button>

          {/* Prev */}
          <button
            onClick={handlePrev} disabled={atStart}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-25"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)" }}
          >
            ◀
          </button>

          {/* Play / Pause */}
          <button
            onClick={handlePlay}
            className="px-5 py-2 rounded-xl text-[13px] font-bold transition-all"
            style={{
              background: isPlaying ? style.bg : style.color,
              border: `1.5px solid ${style.color}`,
              color: isPlaying ? style.color : "#0a0a0a",
            }}
          >
            {isPlaying ? "⏸ Pause" : atEnd ? "↺ Replay" : "▶ Play"}
          </button>

          {/* Next */}
          <button
            onClick={handleNext} disabled={atEnd}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-25"
            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)" }}
          >
            ▶
          </button>

          {/* Narration toggle */}
          <button
            onClick={() => { stopNarrationFn(); setNarEnabled(v => !v); }}
            title={narEnabled ? "Narration on" : "Narration off"}
            className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold transition-all"
            style={{
              background: narEnabled ? "rgba(103,232,249,0.11)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${narEnabled ? "rgba(103,232,249,0.28)" : "rgba(255,255,255,0.09)"}`,
              color: narEnabled ? "#67e8f9" : "rgba(255,255,255,0.38)",
            }}
          >
            {narState === "loading" ? "⏳" : narState === "playing" ? "🔊" : narEnabled ? "🔊" : "🔇"}
          </button>

          {/* Speed */}
          <select
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="rounded-lg text-[11px] font-bold bg-transparent border px-2 py-1.5"
            style={{ borderColor: "rgba(255,255,255,0.11)", color: "rgba(255,255,255,0.45)" }}
          >
            {[0.75, 1, 1.25, 1.5, 2].map(s => (
              <option key={s} value={s} style={{ background: "#141420" }}>{s}x</option>
            ))}
          </select>
        </div>

        {/* Step / chapter label */}
        <div className="text-center text-[10px] text-white/22">
          {revealIdx === -1 ? "Intro" : `Step ${revealIdx + 1} of ${reveals.length}`}
          {chapters.length > 1 && ` · Chapter ${chapIdx + 1}/${chapters.length}`}
        </div>
      </div>
    </div>
  );
}
