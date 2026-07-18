// lib/podcast/podcastTypes.ts
// PodcastLab type contracts — consumed by podcastEngine, /api/podcast-script, and PodcastLab UI.

export type PodcastMode =
  | "page_review"   // Read + explain the page with Right Panel notes
  | "exam_cram"     // Dense review with recall breaks
  | "clinical"      // Clinical-application connections
  | "debate"        // Host & Guest two-voice discussion
  | "quiz_podcast"; // Alternating explanation and quiz questions

export interface ModeTheme {
  bg: string;          // tailwind bg class for studio container
  headerBg: string;    // header gradient class
  accent: string;      // accent color name (for dynamic class construction)
  badge: string;       // mode badge label
  badgeClass: string;  // tailwind classes for badge chip
  hostName: string;    // named host speaker
  guestName: string;   // named guest speaker
  hostRole: string;    // e.g. "Professor", "Attending", "Host"
  guestRole: string;   // e.g. "Student", "Resident", "Challenger"
  hostColor: string;   // tailwind text color for host label
  guestColor: string;  // tailwind text color for guest label
  segmentActiveBg: string; // active segment highlight bg
}

export const MODE_THEMES: Record<PodcastMode, ModeTheme> = {
  page_review: {
    bg:             "bg-[#07111f]",
    headerBg:       "bg-gradient-to-r from-blue-950/80 to-[#07111f]",
    accent:         "blue",
    badge:          "Page Review",
    badgeClass:     "bg-blue-900/50 text-blue-200 border border-blue-600/30",
    hostName:       "Dr. Rivera",
    guestName:      "Jaylen",
    hostRole:       "Professor",
    guestRole:      "Student",
    hostColor:      "text-blue-300",
    guestColor:     "text-sky-300",
    segmentActiveBg: "bg-blue-900/35 border-blue-500/40",
  },
  exam_cram: {
    bg:             "bg-[#110202]",
    headerBg:       "bg-gradient-to-r from-red-950/80 to-[#110202]",
    accent:         "red",
    badge:          "Exam Cram",
    badgeClass:     "bg-red-900/50 text-red-200 border border-red-600/30",
    hostName:       "Max",
    guestName:      "Sam",
    hostRole:       "Host",
    guestRole:      "Reviewer",
    hostColor:      "text-red-300",
    guestColor:     "text-orange-300",
    segmentActiveBg: "bg-red-900/35 border-red-500/40",
  },
  clinical: {
    bg:             "bg-[#020f0e]",
    headerBg:       "bg-gradient-to-r from-teal-950/80 to-[#020f0e]",
    accent:         "teal",
    badge:          "Clinical Conference",
    badgeClass:     "bg-teal-900/50 text-teal-200 border border-teal-600/30",
    hostName:       "Dr. Chen",
    guestName:      "Resident",
    hostRole:       "Attending",
    guestRole:      "Resident",
    hostColor:      "text-teal-300",
    guestColor:     "text-cyan-300",
    segmentActiveBg: "bg-teal-900/35 border-teal-500/40",
  },
  debate: {
    bg:             "bg-[#060e06]",
    headerBg:       "bg-gradient-to-r from-green-950/80 to-[#060e06]",
    accent:         "green",
    badge:          "Avrrio Rounds",
    badgeClass:     "bg-green-900/50 text-green-200 border border-green-600/30",
    hostName:       "Armando",
    guestName:      "Kai",
    hostRole:       "Host",
    guestRole:      "Challenger",
    hostColor:      "text-green-300",
    guestColor:     "text-lime-300",
    segmentActiveBg: "bg-green-900/35 border-green-500/40",
  },
  quiz_podcast: {
    bg:             "bg-[#0c0217]",
    headerBg:       "bg-gradient-to-r from-purple-950/80 to-[#0c0217]",
    accent:         "purple",
    badge:          "Recall Challenge",
    badgeClass:     "bg-purple-900/50 text-purple-200 border border-purple-600/30",
    hostName:       "Alex",
    guestName:      "Riley",
    hostRole:       "Host",
    guestRole:      "Contestant",
    hostColor:      "text-purple-300",
    guestColor:     "text-yellow-300",
    segmentActiveBg: "bg-purple-900/35 border-purple-500/40",
  },
};

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
    description: "Professor + student walk through the page",
    hostVoice: "onyx",
    guestVoice: "nova",
  },
  {
    id: "exam_cram",
    label: "Exam Cram",
    icon: "🎯",
    description: "High-yield rapid review — facts, mechanisms, quiz breaks",
    hostVoice: "onyx",
    guestVoice: "alloy",
  },
  {
    id: "clinical",
    label: "Clinical Conference",
    icon: "🏥",
    description: "Attending-resident patient case discussion",
    hostVoice: "onyx",
    guestVoice: "nova",
  },
  {
    id: "debate",
    label: "Avrrio Rounds",
    icon: "🎙️",
    description: "Evidence-based debate with challenges and rebuttals",
    hostVoice: "onyx",
    guestVoice: "fable",
  },
  {
    id: "quiz_podcast",
    label: "Recall Challenge",
    icon: "❓",
    description: "Game-show style: explain, quiz, reveal, repeat",
    hostVoice: "shimmer",
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
