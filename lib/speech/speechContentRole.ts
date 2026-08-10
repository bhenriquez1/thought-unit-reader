// lib/speech/speechContentRole.ts
// The explicit boundary between the two visible speech experiences:
// Current Page sends exact source text, while Professor/Whiteboard narration
// may explain, paraphrase, and teach. Legacy internal speech builders also
// keep this field so compatibility code never has to infer intent from a
// mode or segment-role string.
export type SpeechContentRole = "SOURCE_VERBATIM" | "PROFESSOR_EXPLANATION";
