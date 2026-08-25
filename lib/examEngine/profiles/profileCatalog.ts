// lib/examEngine/profiles/profileCatalog.ts
// TestLab legacy-fallback audit — the product surface (dashboard header,
// exam-type picker) must show that TestLab supports more than one exam
// profile. DAT, Custom Exam, (C5) Board/Licensure, and (C6) Course Exam have
// a real ExamProfile implementation today (see datProfile.ts /
// customProfile.ts / boardLicensureProfile.ts / courseExamProfile.ts); MCAT
// remains a "coming soon" placeholder. This catalog is the single source of
// truth both app/apex/page.tsx (dashboard header switcher) and
// app/apex/generator/page.tsx (Exam Type picker) render from, so the two
// surfaces can't drift into listing different profiles.
//
// `available: false` entries are real, visible, selectable-looking options
// that resolve to an explicit "not built yet" state rather than silently
// doing nothing — never a disabled-looking ghost button.

import { DAT_EXAM_PROFILE_ID } from "./datProfile";
import { CUSTOM_EXAM_PROFILE_ID } from "./customProfile";
import { BOARD_LICENSURE_EXAM_PROFILE_ID } from "./boardLicensureProfile";
import { COURSE_EXAM_PROFILE_ID } from "./courseExamProfile";

export interface ExamProfileCatalogEntry {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  available: boolean;
}

export const EXAM_PROFILE_CATALOG: ExamProfileCatalogEntry[] = [
  {
    id: DAT_EXAM_PROFILE_ID,
    label: "DAT",
    shortLabel: "DAT",
    description: "Dental Admission Test — official section weighting and blueprint",
    available: true,
  },
  {
    id: "mcat",
    label: "MCAT",
    shortLabel: "MCAT",
    description: "Medical College Admission Test",
    available: false,
  },
  {
    id: BOARD_LICENSURE_EXAM_PROFILE_ID,
    label: "Board / Licensure",
    shortLabel: "Board",
    description: "Pass/fail board exam — foundational + clinical sections",
    available: true,
  },
  {
    id: COURSE_EXAM_PROFILE_ID,
    label: "Course Exam",
    shortLabel: "Course",
    description: "Chapter quiz, unit exam, midterm, or cumulative final",
    available: true,
  },
  {
    id: CUSTOM_EXAM_PROFILE_ID,
    label: "Custom Exam",
    shortLabel: "Custom",
    description: "No external blueprint — draws only from your uploaded source",
    available: true,
  },
];
