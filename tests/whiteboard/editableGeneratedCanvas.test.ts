import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"),
  "utf8",
);

describe("editable generated tldraw canvas", () => {
  it("unlocks generated shapes only through an explicit edit action", () => {
    const start = src.indexOf("const handleEnableEditing = useCallback");
    const block = src.slice(start, start + 850);
    expect(block).toMatch(/isPlayingRef\.current/);
    expect(block).toMatch(/filter\(\(shape\) => shape\.isLocked\)/);
    expect(block).toMatch(/isLocked: false/);
    expect(block).toMatch(/isReadonly: false/);
  });

  it("keeps editing disabled while Professor is playing", () => {
    expect(src).toMatch(/disabled=\{isPlaying \|\| editingEnabled\}/);
    expect(src).toMatch(/onClick=\{handleEnableEditing\}/);
  });
});
