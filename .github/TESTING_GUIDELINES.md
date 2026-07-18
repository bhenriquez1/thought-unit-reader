# Avrrio Reader — Testing Guidelines

Manual smoke tests for each workspace. Run the relevant section before marking a PR ready.
These are **not** automated tests — they are human-verified flows that catch integration and UX regressions that unit tests miss.

---

## Setup

1. Start the dev server: `npm run dev`
2. Open `http://localhost:3000`
3. Upload a multi-chapter PDF (100+ pages works best for surfacing rendering issues)

---

## 📖 Reader — Smoke Tests

**Highlighting sync**
1. Click any thought-unit card in the Right Panel → left panel highlight moves to match
2. Scroll the PDF → right panel card follows without lag
3. Click a card, then immediately scroll — the card-click anchor stays focused for ~1.5 s before scroll-sync resumes

**Speech**
1. Press play → speech starts and the highlighted word tracks in the PDF
2. Drag the speed slider mid-utterance → speed changes without restarting from the beginning (HTML audio) or restarts cleanly at new speed (browser fallback)
3. Turn the page during playback → playback stops cleanly; no audio from the previous page bleeds through
4. Click a paragraph in the PDF → speech jumps to that paragraph

**Navigation**
1. Jump 10 pages via the page input → right panel loads the correct page's content
2. Back-navigate to a visited page → previously generated content shows without re-fetching

---

## 📑 Study Sheet — Smoke Tests

**Generation**
1. Open a note in NoteLab with at least one highlight anchor
2. Click "Generate Study Sheet" → loading spinner visible; sheet appears within ~15 s
3. Profile badge shows the auto-detected profile with a confidence percentage
4. If confidence < 60%, the badge is orange

**Regeneration**
1. Click "↺ Regenerate" → spinner shows; new sheet replaces the old one
2. While waiting, disconnect the network → error message appears below the header strip (not a silent failure)

**Validation issues**
1. Generate a sheet for a concept that is sparse in the source (e.g., a niche topic not covered in the text)
2. Validation panel shows "NOT FOUND IN SUPPLIED SOURCE" with human-readable section names and messages — never raw code strings like `"required-section-missing"`

---

## 🎧 Listen — Smoke Tests

**Mode switching**
1. Open Listen on page 5, generate a script in "Page Review" mode
2. Switch to "Exam Cram" mode → previous script is aborted; new script generates fresh
3. Switch to a new page → script generation aborts; new page's script generates

**Playback**
1. Press play → "⏳" shows until all segments are buffered, then play begins
2. Click ⟨10 → jumps back 10 s in the current audio segment
3. Click 10⟩ → jumps forward 10 s
4. Click ⏮ → goes to the previous segment
5. Click ⏭ → goes to the next segment
6. Pause and resume → resumes from the same position

**Voice check**
1. Open "Exam Cram" mode → host and guest voices are audibly distinct (onyx vs alloy, not identical)

---

## 🎯 DAT Apex — Smoke Tests

**Adaptive difficulty**
1. Complete 5+ practice sessions
2. Open DAT Apex → Today tab shows a recommendation card with a "Start Now" button
3. Click "Start Now" → exam launches in the proctor view targeting the recommended patterns

**Weak topic practice**
1. Identify a pattern with low readiness in the Patterns tab
2. Confirm the Today recommendation reflects that weakness

**Session persistence**
1. Complete a session and close the tab
2. Reopen → session history is intact, `adaptiveDifficulty` is preserved

---

## 🧠 Recall — Smoke Tests

1. Generate a recall set from a NoteLab note
2. Start a review session → cards appear in sequence
3. Rate a card "hard" → the next appearance interval is shorter than for a card rated "easy"
4. Finish the session → session count increments in the Recall dashboard

---

## 🏫 Learning Hub — Smoke Tests

**AI Coach**
1. Open Learning Hub → AI Coach tab
2. Click a quick-prompt chip → question populates the textarea
3. Press ⌘↵ → request fires; "Thinking…" shows; response appears within ~10 s
4. Click "Ask Coach" button → same flow (single handler, not a duplicate)
5. Disconnect network → error message appears; loading clears

**Today tab**
1. With a study plan loaded: 7-day calendar strip is visible
2. Without a study plan: calendar strip is absent (not an empty container)

---

## ✨ Elena Mode — Smoke Tests

**First-time setup**
1. Enable `NEXT_PUBLIC_ELENA_MODE_ENABLED=true` in `.env.local`
2. Navigate to Elena Mode → Setup form appears
3. Enter a name, select age range, pick interests → "Create Learning Space →" is enabled
4. Save → Home tab appears with the correct name in the header

**Rewards**
1. Click "Log Reading Session (+1 ⭐)" → star counter increments; toast appears
2. Check the Progress tab → achievement earned on first star is shown in "Earned" section
3. Log a second session the same day → streak shows 2
4. Refresh the page → all state persists (stars, streak, session count)

**Tabs**
1. Switch to Library tab → bookshelf renders (empty initially); interests show as chips
2. Switch to Progress tab → level badge and all achievements (earned + locked) render without errors
3. Return to Home tab → state is unchanged

---

## Cross-Workspace

**Book change**
1. Upload Book A, generate content (study sheet, recall set, podcast script)
2. Upload Book B → Reader resets to page 1; audio cache is cleared; no Book A content bleeds into Book B's workspace

**Refresh persistence**
1. Reach page 150, generate a study sheet, log an Elena session
2. Hard-refresh → page position, study sheet, Elena stars all restore correctly
