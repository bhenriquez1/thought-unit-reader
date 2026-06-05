// lib/podcast/podcastTypes.ts
// PodcastLab type contracts — consumed by podcastEngine, /api/podcast-script, and PodcastLab UI.

export type PodcastMode =
  | "page_review"   // Read + explain the page with Right Panel notes
  | "exam_cram"     // Dense review with recall breaks
  | "clinical"      // Clinical-application connections
  | "debate"        // Host & Guest two-voice discussion
  | "quiz_podcast"; // Alternating explanation and quiz questions

export type PodcastSegmentType =
  | "intro"
  | "page_reading"
  | "right_panel_note"
  | "highlight_evidence"
  | "notelab_expansion"
  | "recall_quiz"
  | "external_verify"
  | "outro";

export type PodcastSpeaker = "host" | "guest" | "narrator";

export interface PodcastSegment {
  id: string;
  type: PodcastSegmentType;
  speaker: PodcastSpeaker;
  text: string;
  /** Which Right Panel sourceField this segment explains — drives Left Panel focus */
  sourceField?: string;
  /** visualAnchor.id to focus on left panel while this segment plays */
  anchorId?: string;
  /** RecallLab card id for quiz segments */
  recallCardId?: string;
  /** NoteLab section label driving this expansion */
  noteLabel?: string;
  /** External source topic for verification segments */
  externalTopic?: string;
}

export interface PodcastScript {
  mode: PodcastMode;
  pageNumber: number;
  bookId: string;
  segments: PodcastSegment[];
  totalSegments: number;
  estimatedMinutes: number;
}

export const PODCAST_MODES: Array<{
  id: PodcastMode;
  label: string;
  icon: string;
  description: string;
  hostVoice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  guestVoice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
}> = [
  {
    id: "page_review",
    label: "Page Review",
    icon: "📖",
    description: "Read & explain the page with Right Panel notes",
    hostVoice: "echo",
    guestVoice: "echo",
  },
  {
    id: "exam_cram",
    label: "Exam Cram",
    icon: "🎯",
    description: "Dense review — key facts, mechanisms, recall breaks",
    hostVoice: "echo",
    guestVoice: "echo",
  },
  {
    id: "clinical",
    label: "Clinical Connection",
    icon: "🏥",
    description: "Connect page concepts to clinical applications",
    hostVoice: "echo",
    guestVoice: "nova",
  },
  {
    id: "debate",
    label: "Debate / Host & Guest",
    icon: "🎙️",
    description: "Two-voice discussion exploring the material",
    hostVoice: "echo",
    guestVoice: "nova",
  },
  {
    id: "quiz_podcast",
    label: "Quiz Podcast",
    icon: "❓",
    description: "Explanation and quiz questions back-to-back",
    hostVoice: "echo",
    guestVoice: "nova",
  },
];

// Segment type → border color class for the UI
export const SEGMENT_COLORS: Record<PodcastSegmentType, string> = {
  intro:              "border-blue-500/50",
  page_reading:       "border-slate-500/50",
  right_panel_note:   "border-emerald-500/50",
  highlight_evidence: "border-amber-500/50",
  notelab_expansion:  "border-green-500/50",
  recall_quiz:        "border-purple-500/50",
  external_verify:    "border-cyan-500/50",
  outro:              "border-blue-500/30",
};

export const SEGMENT_LABELS: Record<PodcastSegmentType, string> = {
  intro:              "Intro",
  page_reading:       "Page",
  right_panel_note:   "Study Note",
  highlight_evidence: "Evidence",
  notelab_expansion:  "NoteLab",
  recall_quiz:        "Quiz Break",
  external_verify:    "External Verify",
  outro:              "Outro",
};
