// app/apex/layout.tsx
// Product-split Phase 1, item 4 — TestLab gets its own shell instead of
// every /apex/** page inheriting the root layout's "Avrrio Reader" title
// (app/layout.tsx) with no route-tree identity of its own. Next.js merges
// nested layout metadata with the root's, so this overrides just the title/
// description for everything under /apex — no changes needed to any
// individual page, and no risk to their existing headers/rendering.
//
// Deliberately does not introduce shared visual chrome (a persistent header/
// nav bar) beyond metadata — every /apex/** page already renders its own
// page-specific header (blueprint info, results summary, etc.); stacking a
// second generic layout-level header on top of those would be a visual
// redesign, not "give it a shell," and isn't verifiable without a browser
// in this sandbox. A shared header is a reasonable follow-on if wanted.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Avrrio TestLab',
  description: 'Exam preparation, simulation, and readiness tracking — questions grounded in your own book, not a generic bank.',
};

export default function ApexLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
