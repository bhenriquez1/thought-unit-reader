# Avrrio Reader — PR Checklist

Copy this into every PR description, or verify each item before marking the PR ready for review.

---

## Scope

- [ ] This PR addresses **one concern** (a single workspace, a single system, or a single category of fixes)
- [ ] If this PR touches more than two workspaces, each workspace change is isolated to its own commit so individual areas can be reverted cleanly
- [ ] No feature additions snuck into a stability/bugfix PR, and no large refactors bundled into a feature PR

**Target PR sizes by type:**

| Type | Max files touched | Max diff lines |
|---|---|---|
| Bugfix / stability | 5 | 150 |
| Single workspace feature | 10 | 400 |
| Multi-workspace sprint | 20 | 800 |
| Engineering standards / docs | Unlimited | Unlimited |

---

## Quality Gates

- [ ] `npx tsc --noEmit` — no new TypeScript errors
- [ ] `npx next lint` — no new lint errors
- [ ] `npm run build` — build succeeds locally (or CI is trusted to catch this)
- [ ] CI (CodeQL) is green — or failure is pre-existing and documented
- [ ] **Browser smoke test run** — `npm run dev`, open each workspace this PR touches, and exercise the changed flow end-to-end in a real browser (see `TESTING_GUIDELINES.md`). A build passing in CI is not a substitute for running the app.

> **Never merge without a browser smoke test.** TypeScript and linting verify code structure, not runtime behaviour. Every PR that touches a workspace component must be manually exercised before merge — a compile-clean PR can still produce an infinite re-render loop, a hydration crash, or a broken interaction that only surfaces when the app actually runs.

---

## Stability Checklist (check all that apply)

- [ ] New async operations use `AbortController`; the controller is aborted on unmount or when the operation is superseded
- [ ] No new state field duplicates something already owned by `ReadingFocusStore`, `insightsPanelStore`, or `apexEngineStore` — see `STABILITY_GUIDELINES.md`
- [ ] New `useEffect` dependencies are exhaustive and do not include unstable object references
- [ ] Stale closure risk is mitigated with a ref (`useRef`) where a callback reads state that changes after the callback is created
- [ ] Event listeners added in `useEffect` are removed in the cleanup function

---

## UX Checklist (check all that apply)

- [ ] Every new async operation has a visible loading indicator
- [ ] Every new error path shows a human-readable message in the UI (not only `console.error`)
- [ ] New empty states explain why empty and what the user can do
- [ ] Any new server-side array input is capped before prompt injection (see anchor-cap pattern in `adaptive-study-sheet.ts` and `dat-study-sheet.ts`)

---

## Workspace Definition of Done — Regression Check

For each workspace this PR touches, verify that **currently implemented** invariants have not regressed. Check the relevant section in `.github/WORKSPACE_DEFINITION_OF_DONE.md` and confirm each item that already exists in the codebase still passes.

> Items in the DoD that are tagged as Sprint 3–7 deliverables or are not yet implemented do **not** need to be completed before this PR ships — they are aspirational targets, not gates. A bugfix in Recall does not require confidence UI (Sprint 3) to be present first.

- [ ] Reader
- [ ] NoteLab / Study Sheet
- [ ] Listen (PodcastLab)
- [ ] DAT Apex
- [ ] Recall
- [ ] Learning Hub
- [ ] Elena Mode

---

## Testing Notes

Describe what was manually verified (reference `.github/TESTING_GUIDELINES.md` for each workspace's smoke test):

```
Workspace: ___________
Flow tested: ___________
Edge cases verified: ___________
```
