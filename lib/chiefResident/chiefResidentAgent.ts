// lib/chiefResident/chiefResidentAgent.ts
// CR1 — the Chief Resident Agent's narrow mission: decide, from a completed
// teaching turn's raw text, whether the session should be handed off to
// another specialized agent — and never more than once per target per
// session. Modeled on whiteboardArtistAgent.ts/notebookDesignerAgent.ts's
// house style: a pure decision core with zero network/IDB/React access,
// and every actual side effect (composing a NoteLab page, opening
// Whiteboard Mode) left to the caller.
//
// Brian's stated architecture ("PDF -> Thought Unit Engine -> Knowledge
// Graph -> shared Learning Context -> specialized agents -> an orchestrator
// decides which agent runs") assumes a real handoff mechanism between the
// conversational tutor and the other agents. Before this module, nothing in
// Chief Resident's teaching loop (pages/api/chief-resident-teaching.ts,
// components/notelab/ChiefResidentPanel.tsx) had any notion of delegation —
// it only ever streamed text back to the student.
//
// Scope of this first pass (CR1), deliberately narrow:
// - The Whiteboard Artist Agent (lib/whiteboard/whiteboardArtistAgent.ts)
//   cannot be invoked headless — runWhiteboardArtistStep requires a live
//   mounted tldraw Editor plus a pre-built ProfessorLessonPlan, neither of
//   which exists inside a Chief Resident conversation. So a "whiteboard"
//   delegation here is only ever a validated SIGNAL ("the student would
//   benefit from a visual") for the caller to act on — this module never
//   claims to invoke the Artist Agent itself.
// - The NoteLab Designer Agent's entry point (runNotebookDesignerStep, via
//   composeNoteNotebookSceneInBackground) IS self-contained — no live editor
//   needed, just an already-saved UltraNote — so a "notelab" delegation can
//   realistically trigger real composition. Still, triggering that
//   composition is the caller's job (it owns the UltraNote and the
//   IndexedDB/Firestore write path), never this module's.
//
// How the model signals delegation: pages/api/chief-resident-teaching.ts's
// system prompt (via CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS below)
// asks the model to end a turn with an optional, exact trailing line —
// `[[DELEGATE: NOTELAB | one-sentence reason]]` or
// `[[DELEGATE: WHITEBOARD | one-sentence reason]]` — only when it judges a
// handoff would genuinely help. This module's only job is parsing that line
// out of the raw response (stripping it from what the student sees) and
// deciding whether it's still eligible to be offered.

export type ChiefResidentDelegationTarget = "notelab" | "whiteboard";

export interface ChiefResidentDelegation {
  target: ChiefResidentDelegationTarget;
  reason: string;
}

export interface ChiefResidentTurnResolution {
  /** The raw text with any trailing delegation directive stripped — this is
   *  the only text that should ever reach the student-facing transcript. */
  visibleText: string;
  /** null when no directive was present, or when it was present but
   *  malformed (missing target/reason) — a malformed directive fails
   *  closed: no delegation is offered, but see resolveChiefResidentTurn's
   *  own doc comment on what still gets stripped. */
  delegation: ChiefResidentDelegation | null;
}

// Matches a directive only when it is the LAST thing in the message (plus
// optional trailing whitespace) — a directive mentioned mid-explanation
// (e.g. the model discussing the convention itself) is not a real decision
// to delegate and must never trigger one.
const TRAILING_DIRECTIVE = /\n?\[\[DELEGATE:\s*([A-Z]+)\s*\|\s*([^\]]*?)\s*\]\]\s*$/i;

const VALID_TARGETS: ReadonlySet<string> = new Set(["NOTELAB", "WHITEBOARD"]);

/**
 * Pure — no network, no IDB, no React. Strips a trailing delegation
 * directive (if present) from a completed teaching turn's raw text, and
 * validates it into a typed ChiefResidentDelegation. An unrecognized target
 * or an empty reason is treated as malformed: the directive line is still
 * stripped (it must never leak into the student-facing transcript), but no
 * delegation is returned — the student should never see raw agent-protocol
 * text, but a malformed instruction from the model is not a real decision
 * this module should act on.
 */
export function resolveChiefResidentTurn(rawText: string): ChiefResidentTurnResolution {
  const match = rawText.match(TRAILING_DIRECTIVE);
  if (!match) return { visibleText: rawText, delegation: null };

  const visibleText = rawText.slice(0, match.index).trimEnd();
  const rawTarget = match[1].toUpperCase();
  const reason = match[2].trim();

  if (!VALID_TARGETS.has(rawTarget) || !reason) {
    return { visibleText, delegation: null };
  }

  return {
    visibleText,
    delegation: { target: rawTarget.toLowerCase() as ChiefResidentDelegationTarget, reason },
  };
}

/**
 * True only when this delegation target has not already been offered this
 * session. Chief Resident should propose handing off to a given specialized
 * agent at most once per session — repeating the same suggestion turn after
 * turn is noise, not help. Callers own the actual "already offered" set
 * (reset whenever the session itself resets, e.g. on page/book change).
 */
export function shouldOfferDelegation(
  target: ChiefResidentDelegationTarget,
  alreadyOffered: ReadonlySet<ChiefResidentDelegationTarget>,
): boolean {
  return !alreadyOffered.has(target);
}

// Appended to Chief Resident's system prompt (all teaching modes except
// rapid-fire, which is deliberately terse and question-only) so the model
// knows the exact directive grammar this module parses. Kept in this file,
// not duplicated in chief-resident-teaching.ts, so the instructions and the
// parser they describe can never drift apart.
export const CHIEF_RESIDENT_DELEGATION_DIRECTIVE_INSTRUCTIONS = `

DELEGATION (optional, use sparingly):
If — and only if — you judge that the student would genuinely benefit from a permanent visual notebook page for this material, or from seeing this concept drawn out step-by-step on a whiteboard, end your entire message with exactly one line in this exact form, and nothing after it:
[[DELEGATE: NOTELAB | one-sentence reason]]
or
[[DELEGATE: WHITEBOARD | one-sentence reason]]
Most turns should NOT include this line. Only include it once you have actually taught the concept, not on your very first orienting message, and never more than one per message.`;

// ---------------------------------------------------------------------------
// CR3 — the same delegation decision, expressed as Realtime API tools
// ---------------------------------------------------------------------------
//
// The trailing [[DELEGATE: ...]] line above only makes sense for a text
// transcript the model is writing — it has nothing to "write" in a live
// voice call. The Realtime API's own native mechanism for this is function
// calling: tool definitions declared once at session-creation time
// (lib/chiefResident/chiefResidentVoiceAgent.ts's buildVoiceSessionRequest
// embeds REALTIME_DELEGATION_TOOLS below), and a function-call event
// delivered over the WebRTC data channel mid-conversation whenever the
// model decides to invoke one
// (lib/chiefResident/useChiefResidentVoiceSession.ts handles that event).
//
// Both mechanisms are validated into the exact same ChiefResidentDelegation
// shape and gated by the exact same shouldOfferDelegation() above, so text
// and voice share one delegation contract and one set of consumers (the
// same NoteLab-compose action, the same whiteboard signal-only rendering)
// rather than voice growing a second, parallel notion of "delegation."
//
// Honesty note: the exact Realtime API function-calling event names/shapes
// below (response.output_item.done carrying a "function_call" item) reflect
// OpenAI's documented Realtime API behavior as of this module's writing,
// but could not be verified against a live connection in this sandbox (no
// OPENAI_API_KEY, no real WebRTC environment) — see
// useChiefResidentVoiceSession.ts's own header for the same caveat.

export interface RealtimeDelegationToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: { reason: { type: "string"; description: string } };
    required: ["reason"];
  };
}

/** Realtime API function name -> delegation target, and its inverse. Kept
 *  as the single source of truth so the tool definitions below and the
 *  parser that reads their call events can never name a target differently. */
const REALTIME_TOOL_NAME: Record<ChiefResidentDelegationTarget, string> = {
  notelab: "delegate_to_notelab",
  whiteboard: "delegate_to_whiteboard",
};

const REALTIME_TARGET_BY_TOOL_NAME: Record<string, ChiefResidentDelegationTarget> = {
  [REALTIME_TOOL_NAME.notelab]: "notelab",
  [REALTIME_TOOL_NAME.whiteboard]: "whiteboard",
};

export const REALTIME_DELEGATION_TOOLS: RealtimeDelegationToolDefinition[] = [
  {
    type: "function",
    name: REALTIME_TOOL_NAME.notelab,
    description:
      "Call this only when you genuinely believe the student would benefit from a permanent visual notebook page for the material just discussed. Most turns should not call this — do not call it on your first message.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "One sentence: why a NoteLab page would help right now." } },
      required: ["reason"],
    },
  },
  {
    type: "function",
    name: REALTIME_TOOL_NAME.whiteboard,
    description:
      "Call this only when you genuinely believe the student would benefit from seeing this concept drawn out step-by-step on a whiteboard. Most turns should not call this — do not call it on your first message.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "One sentence: why a whiteboard drawing would help right now." } },
      required: ["reason"],
    },
  },
];

/**
 * Pure — no network, no WebRTC. Validates a Realtime API function-call
 * (tool name + its raw JSON arguments string) into the same
 * ChiefResidentDelegation shape resolveChiefResidentTurn produces for text.
 * Fails closed: an unrecognized tool name, malformed JSON, or a missing/
 * empty reason all yield null — never a guessed delegation.
 */
export function parseRealtimeDelegationToolCall(
  toolName: string,
  rawArguments: string,
): ChiefResidentDelegation | null {
  const target = REALTIME_TARGET_BY_TOOL_NAME[toolName];
  if (!target) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return null;
  }

  const reason = (parsed as { reason?: unknown } | null)?.reason;
  if (typeof reason !== "string" || !reason.trim()) return null;

  return { target, reason: reason.trim() };
}
