// lib/pdf/stripClassificationFooter.ts
// Remove footer/header boilerplate from raw page text BEFORE classification.
//
// Problem: OpenStax and similar OER books stamp every page with copyright lines
// ("Access for free at openstax.org", "© Rice University", "Printed in USA").
// These lines cause classifyPageContent and extractPageSignals to falsely return
// "copyright_frontmatter" for perfectly valid instructional pages.
//
// Solution: strip up to MAX_FOOTER_LINES trailing lines that match legal/publisher
// boilerplate, and strip up to MAX_HEADER_LINES leading lines that are pure
// page-number or running-header artifacts. The remaining text is the instructional
// body and is what classifiers should see.

const FOOTER_BOILERPLATE_RE =
  /all rights reserved|copyright\s*©?|\bisbn\b|published by|printed in|access for free|openstax\.org|cengage\.|mcgraw.?hill|pearson education|www\.\S+\.\w{2,}|creative commons|this work is licensed/i;

const HEADER_RUNNING_RE =
  /^(\d{1,4}\s+)?(chapter|unit|module|part|section)\s+\d+\b/i;

const MAX_FOOTER_LINES = 6;
const MAX_HEADER_LINES = 3;

export function stripClassificationFooter(pageText: string): string {
  if (!pageText) return pageText;
  const lines = pageText.split("\n");

  // Strip matching trailing lines (footer boilerplate)
  let tail = lines.length - 1;
  let footerStripped = 0;
  while (tail >= 0 && footerStripped < MAX_FOOTER_LINES) {
    const trimmed = lines[tail].trim();
    if (trimmed.length === 0 || FOOTER_BOILERPLATE_RE.test(trimmed)) {
      tail--;
      footerStripped++;
    } else {
      break;
    }
  }

  // Strip matching leading lines (running headers / page numbers)
  let head = 0;
  let headerStripped = 0;
  while (head <= tail && headerStripped < MAX_HEADER_LINES) {
    const trimmed = lines[head].trim();
    if (trimmed.length === 0 || /^\d{1,4}$/.test(trimmed) || HEADER_RUNNING_RE.test(trimmed)) {
      head++;
      headerStripped++;
    } else {
      break;
    }
  }

  return lines.slice(head, tail + 1).join("\n");
}
