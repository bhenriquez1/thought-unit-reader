// lib/speech/speechContentRole.ts
// Phase B3 — the explicit SOURCE_VERBATIM vs PROFESSOR_EXPLANATION
// distinction the architecture diagnosis flagged as implicit: Reader speech
// modes (Focus/Highlight Only/Full/Current Page) must speak only exact PDF
// text; Professor/Whiteboard narration may explain, paraphrase, and teach.
// Study/Guided sit between those two — they already interleave brief
// AI-authored lines (SpeechSegmentRole "checkpoint" in studySpeechEngine.ts)
// with verbatim anchor text, which is a deliberate, approved product
// decision, not a bug. What was missing is that this distinction lived only
// as an implicit "which role string is 'checkpoint'" convention — every
// spoken segment, on both the Reader and Whiteboard surfaces, now carries
// this as an explicit field instead, so the UI and speech pipeline never
// have to re-derive it from a mode/role heuristic.
export type SpeechContentRole = "SOURCE_VERBATIM" | "PROFESSOR_EXPLANATION";
