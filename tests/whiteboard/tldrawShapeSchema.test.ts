// tests/whiteboard/tldrawShapeSchema.test.ts
//
// Regression guard: tldraw v5 geo and arrow shapes use richText (TLRichText)
// instead of the old plain-string `text` property. Using `props.text` on a
// geo or arrow shape produces a ValidationError at runtime:
//   "At shape(type = geo).props.text: Unexpected property"
//
// This test inspects the source of TldrawCanvas.tsx at the static-analysis
// layer to confirm:
//   1. No `text:` field appears in geo or arrow shape props.
//   2. `richText:` (via toRichText()) is used instead.
//   3. Arrow `start`/`end` use plain VecModel {x, y}, not {type:"point",x,y}.
//   4. `toRichText` is imported from @tldraw/tldraw.

import fs from "fs";
import path from "path";

const CANVAS     = path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx");

describe("tldraw v5 geo shape schema — TldrawCanvas.tsx", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("imports toRichText from @tldraw/tldraw", () => {
    expect(src).toMatch(/import\s+\{[^}]*toRichText[^}]*\}\s+from\s+["']@tldraw\/tldraw["']/);
  });

  it("does NOT use props.text on geo shapes (old schema)", () => {
    // geo shape creation blocks must not have a bare `text:` prop
    expect(src).not.toMatch(/geo:\s*["']rectangle["'][^}]*text:/s);
  });

  it("uses richText: toRichText(...) for geo shape content", () => {
    expect(src).toMatch(/richText:\s*toRichText\(/);
  });
});

describe("tldraw v5 arrow shape schema — TldrawCanvas.tsx", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("does NOT use { type: 'point', x, y } for arrow start/end (old schema)", () => {
    expect(src).not.toMatch(/type:\s*["']point["']/);
  });

  it("uses plain VecModel { x, y } for arrow start", () => {
    // Should have `start: { x:` somewhere in arrow creation
    expect(src).toMatch(/start:\s*\{\s*x:/);
  });

  it("uses kind: 'arc' on arrow shapes", () => {
    expect(src).toMatch(/kind:\s*["']arc["']/);
  });

  it("does NOT use props.text on arrow shapes (old schema)", () => {
    expect(src).not.toMatch(/kind:\s*["']arc["'][^}]*text:/s);
  });

  it("uses richText: toRichText(...) for arrow label", () => {
    expect(src).toMatch(/richText:\s*toRichText\(/);
  });
});

describe("tldraw license key wiring — TldrawCanvas.tsx", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("reads licenseKey from NEXT_PUBLIC_TLDRAW_LICENSE_KEY", () => {
    expect(src).toMatch(/licenseKey\s*=\s*process\.env\.NEXT_PUBLIC_TLDRAW_LICENSE_KEY/);
  });

  it("passes the licenseKey variable to <Tldraw>", () => {
    expect(src).toMatch(/licenseKey=\{licenseKey\}/);
  });

  it("does NOT hardcode a literal tldraw license key", () => {
    expect(src).not.toMatch(/licenseKey=\{["'`]tldraw-/);
  });

  it("shows a visible role=\"alert\" configuration error when the key is missing in production", () => {
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Whiteboard configuration is unavailable/);
  });

  it("only blocks rendering when NODE_ENV is production (dev works without a key)", () => {
    expect(src).toMatch(/process\.env\.NODE_ENV\s*===\s*["']production["']\s*&&\s*!licenseKey/);
  });
});

describe("tldraw persistenceKey — localStorage removed — TldrawCanvas.tsx", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CANVAS, "utf8"); });

  it("passes persistenceKey prop to <Tldraw>", () => {
    expect(src).toMatch(/persistenceKey=/);
  });

  it("does NOT use SNAP_PREFIX manual localStorage persistence", () => {
    expect(src).not.toMatch(/SNAP_PREFIX/);
  });

  it("does NOT call localStorage.setItem for canvas state", () => {
    expect(src).not.toMatch(/localStorage\.setItem/);
  });

  it("does NOT call localStorage.getItem for canvas state", () => {
    expect(src).not.toMatch(/localStorage\.getItem/);
  });
});
