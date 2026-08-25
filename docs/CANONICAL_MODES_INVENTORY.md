# Canonical TestLab, Elena, and Recall inventory

Audited on 2026-08-25 from `main` at `08db9c6f`. `Production reachable` means reachable through the checked-in Next.js routes/navigation; it does not claim that this branch is deployed.

| File/component | Product | Purpose | Latest/legacy | Production reachable | Shared dependency | Action |
|---|---|---|---|---|---|---|
| `app/apex/page.tsx` | TestLab | Canonical dashboard and profile selection | Latest | Yes, `/apex` | exam profiles, Apex store, Reader catalogue | KEEP |
| `app/apex/generator/page.tsx` | TestLab | Source selection and exam generation | Latest | Yes | exam engine, document store | KEEP |
| `app/apex/proctor/page.tsx` | TestLab | Timed/practice exam runner | Latest | Yes | pending exam store, session state | KEEP |
| `app/apex/results/page.tsx` | TestLab | Scoring, review, Recall handoff | Latest | Yes | scoring, misconception capture | KEEP |
| `app/apex/review/page.tsx` | TestLab | Mistake review | Latest | Yes | attempt/mistake stores | KEEP |
| `app/apex/patterns/**` | TestLab | Decision-pattern training | Current supporting route | Yes | pattern library | KEEP |
| `lib/datApex/**` | TestLab | DAT blueprint, persistence, readiness | Latest | Indirect | IndexedDB, Learning State | KEEP |
| `lib/apex/**` | TestLab | Catalogue, scoring, training helpers | Current shared layer | Indirect | Reader notes/documents | KEEP |
| `lib/examEngine/**` | TestLab | Profile-generic generation and proctor contracts | Latest | Indirect | AI routes, source knowledge | KEEP |
| `lib/stores/apexEngineStore.ts` | TestLab | Current dashboard state | Current | Indirect | local persistence | KEEP |
| `app/elena/page.tsx` | Elena | Canonical route boundary | Latest | Yes, `/elena` | `ElenaChildWorkspace` | KEEP |
| `components/elena/ElenaChildWorkspace.tsx` | Elena | Canonical onboarding and child workspace | Latest | Yes | Elena IndexedDB, child books | KEEP |
| `components/elena/ParentGate.tsx` | Elena | Protected parent access | Latest | Yes | salted PIN store | KEEP |
| `components/elena/ParentDashboard.tsx` | Elena | Parent settings and real progress | Latest | Yes | child progress/vocabulary | KEEP |
| `components/elena/ChildReaderTab.tsx` | Elena | Child reading experience | Latest | Yes | shared document store | KEEP |
| `components/elena/{AdventureMap,MemoryMatch,WordScramble,ReadingBuddy}.tsx` | Elena | Grounded activities | Latest | Yes | profile, vocabulary, canonical page context | KEEP |
| `lib/elena/idbStore.ts` | Elena | Profiles, progress, rewards and vocabulary | Latest migration boundary | Indirect | IndexedDB | KEEP |
| `lib/elena/featureFlags.ts` | Elena | Compatibility parsing for environment values | Reliability compatibility, not a competing UI | Indirect | environment configuration | KEEP |
| `pages/api/elena-{buddy,vocab}.ts` | Elena | Grounded AI endpoints | Latest | Yes | canonical child page context | KEEP |
| Adult Reader Elena shell action in `pages/index.tsx` | Elena | Navigates to canonical `/elena` | Latest navigation | Yes | Next router | KEEP |
| `components/recalllab/RecallLab.tsx` | Recall | Single public Recall surface and old-data import boundary | Latest | Yes | RecallSet store, Recall 2 | KEEP |
| `components/recalllab/Recall2Lab.tsx` | Recall | Canonical retrieval-practice workspace | Latest | Yes | blueprint/SRS stores | KEEP |
| `components/recalllab/Recall2Session.tsx` | Recall | Canonical confidence/SRS session | Latest | Yes | shared Learning State | KEEP |
| `components/recalllab/LegacyRecallLab.tsx` | Recall | Superseded classic dashboard/session duplicate | Legacy | No direct import; tests referenced it | None after test migration | REMOVE |
| `lib/recalllab/recallStore.ts` | Recall | Existing RecallSet persistence imported by Recall 2 | Migration source, not competing UI | Indirect | localStorage/IndexedDB bridge | MIGRATE |
| `lib/recalllab/recall2Store.ts` | Recall | Canonical Recall blueprint persistence | Latest | Indirect | IndexedDB | KEEP |

## Canonical routing decisions

- `/apex` is the only TestLab dashboard. Supporting `/apex/*` routes belong to the same exam workflow; none redirects to a second dashboard.
- `/elena` directly renders `ElenaChildWorkspace`. The adult Reader action routes there rather than embedding an alternate Elena dashboard.
- The Reader imports only `components/recalllab/RecallLab.tsx`, which renders `Recall2Lab`. Classic Recall UI code is removed, while `RecallSet` persistence remains as an explicit, document-scoped migration input so existing student cards are not discarded.

## Storage safety

- TestLab retains its current IndexedDB attempt/readiness/session stores and `avrrio:testlab:activeProfileId` preference.
- Elena retains its IndexedDB database and protected parent-gate records. No profile or progress store is deleted or renamed in this cleanup.
- Recall retains the old `RecallSet` storage reader until migrated data no longer needs importing. The removed item is UI code only.
