# Canonical TestLab, Elena, and Recall inventory

Audited through 2026-08-26 from current `main` plus this branch. `Production reachable` means reachable through the checked-in Next.js routes/navigation; it does not claim that this branch is deployed.

| File/component | Product | Purpose | Latest/legacy | Production reachable | Shared dependency | Action |
|---|---|---|---|---|---|---|
| `app/apex/page.tsx` | TestLab | Canonical source-first workspace: exam purpose → Reader source → configuration | Latest | Yes, `/apex` | exam profiles, attempt/readiness stores, Reader catalogue | KEEP |
| `app/apex/generator/page.tsx` | TestLab | Distinct guided Practice/Simulation configuration over one source-grounded engine | Latest | Yes | exam engine, document store | KEEP |
| `app/apex/proctor/page.tsx` | TestLab | Timed/practice exam runner | Latest | Yes | pending exam store, session state | KEEP |
| `app/apex/results/page.tsx` | TestLab | Scoring, review, Recall handoff | Latest | Yes | scoring, misconception capture | KEEP |
| `app/apex/review/page.tsx` | TestLab | Mistake review | Latest | Yes | attempt/mistake stores | KEEP |
| `app/apex/patterns/**` | TestLab | Old DAT-pattern URLs retained only as safe redirects | Legacy route | Redirect only | none | MIGRATE |
| `lib/datApex/**` | TestLab | DAT blueprint, persistence, readiness | Latest | Indirect | IndexedDB, Learning State | KEEP |
| `lib/apex/**` | TestLab | Catalogue, scoring, training helpers | Current shared layer | Indirect | Reader notes/documents | KEEP |
| `lib/examEngine/**` | TestLab | Profile-generic generation and proctor contracts | Latest | Indirect | AI routes, source knowledge | KEEP |
| `components/apex/TrainingArena.tsx` | TestLab | DAT-pattern training dashboard embedded in the old `/apex` shell | Legacy | Previously | Apex pattern/readiness stores | REMOVE |
| `lib/stores/apexEngineStore.ts` | TestLab | Historical pattern-training state retained for stored-data compatibility | Legacy data source | No canonical landing-page dependency | local persistence | MIGRATE |
| `app/elena/page.tsx` | Elena | Canonical route boundary | Latest | Yes, `/elena` | `ElenaChildWorkspace` | KEEP |
| `components/elena/ElenaChildWorkspace.tsx` | Elena | Canonical reader-first onboarding and child workspace | Latest | Yes | Elena IndexedDB, child books | KEEP |
| `components/elena/ParentGate.tsx` | Elena | Protected parent access | Latest | Yes | salted PIN store | KEEP |
| `components/elena/ParentDashboard.tsx` | Elena | Parent settings and real progress | Latest | Yes | child progress/vocabulary | KEEP |
| `components/elena/ChildReaderTab.tsx` | Elena | Child reading experience | Latest | Yes | shared document store | KEEP |
| `components/elena/{AdventureMap,MemoryMatch,WordScramble,ReadingBuddy}.tsx` | Elena | Grounded activities | Latest | Yes | profile, vocabulary, canonical page context | KEEP |
| `lib/elena/idbStore.ts` | Elena | Profiles, progress, rewards and vocabulary | Latest migration boundary | Indirect | IndexedDB | KEEP |
| `lib/elena/featureFlags.ts` | Elena | Compatibility parsing for environment values | Reliability compatibility, not a competing UI | Indirect | environment configuration | KEEP |
| `pages/api/elena-{buddy,vocab}.ts` | Elena | Grounded AI endpoints | Latest | Yes | canonical child page context | KEEP |
| Adult Reader Elena shell action in `pages/index.tsx` | Elena | Navigates to canonical `/elena` | Latest navigation | Yes | Next router | KEEP |
| `components/notelab/UltraNotesList.tsx` | NoteLab | Canonical saved-note workspace shown immediately after Save to NoteLab | Latest | Yes | UltraNote IndexedDB/local mirror | KEEP |
| `components/notelab/LearningSourcesManager.tsx` | NoteLab | Secondary evidence/source manager for the active concept | Latest support surface | Yes, Evidence sub-tab | canonical page evidence | KEEP |
| `components/workspace/PersonalWorkspaceTab.tsx` | NoteLab | Generic personal-workspace UI that displaced structured saved notes | Superseded product surface | No canonical NoteLab render | workspace store retained | INVESTIGATE |
| `components/recalllab/RecallLab.tsx` | Recall | Single public Recall surface and old-data import boundary | Latest | Yes | RecallSet store, Recall 2 | KEEP |
| `components/recalllab/Recall2Lab.tsx` | Recall | Canonical retrieval-practice workspace | Latest | Yes | blueprint/SRS stores | KEEP |
| `components/recalllab/Recall2Session.tsx` | Recall | Canonical confidence/SRS session | Latest | Yes | shared Learning State | KEEP |
| `components/recalllab/Recall2Dashboard.tsx` | Recall | Older overview/phase/import dashboard stacked below current-page retrieval | Superseded | Previously | Recall 2 store | REMOVE |
| `components/recalllab/LegacyRecallLab.tsx` | Recall | Superseded classic dashboard/session duplicate | Legacy | No direct import; tests referenced it | None after test migration | REMOVE |
| `lib/recalllab/recallStore.ts` | Recall | Existing RecallSet persistence imported by Recall 2 | Migration source, not competing UI | Indirect | localStorage/IndexedDB bridge | MIGRATE |
| `lib/recalllab/recall2Store.ts` | Recall | Canonical Recall blueprint persistence | Latest | Indirect | IndexedDB | KEEP |

## Canonical routing decisions

- `/apex` is the only TestLab entry. It begins with exam purpose and an uploaded Reader source; the former Today/Learn/Practice/Full-Length dashboard and Training Arena are not rendered.
- Practice and Simulation are distinct guided entries. A general uploaded source defaults to Custom Exam; DAT-specific sections appear only after the learner explicitly selects DAT.
- `/elena` directly renders `ElenaChildWorkspace` and opens on the child Reader. Home/Today/Challenge are not primary navigation destinations; Books, Vocabulary, Practice, Progress, and Adventures support the reading workflow.
- NoteLab opens on structured saved notes. Evidence and Chief Resident remain supporting tabs; the source graph no longer masquerades as the notebook home.
- The Reader imports only `components/recalllab/RecallLab.tsx`, which renders one `Recall2Lab` home and `Recall2Session`. Classic/stacked Recall dashboards are removed, while `RecallSet` persistence remains an automatic, document-scoped migration input so existing student cards are not discarded.
- Reader panel ownership is explicit: Sticky Notes owns the permanent left rail, Thought Units live in the PDF-attached Page Guide drawer, and the right panel owns Speech/Whiteboard/Chief Resident.

## Storage safety

- TestLab retains its IndexedDB attempt/readiness/session stores. The UI preference moves to `avrrio:testlab:activeProfileId:v2` so stale DAT-dashboard defaults do not override the source-first product; no attempt or readiness data is changed.
- Elena retains its IndexedDB database and protected parent-gate records. No profile or progress store is deleted or renamed in this cleanup.
- Recall retains the old `RecallSet` storage reader until migrated data no longer needs importing. The removed item is UI code only.
