import fs from "fs";
import path from "path";

const source = fs.readFileSync(
  path.resolve(__dirname, "../../lib/stores/focusCycleStore.ts"),
  "utf8",
);

describe("Focus Cycle wall-clock stability", () => {
  it("starts from a deadline and derives ticks from wall-clock time", () => {
    expect(source).toMatch(/timerEndsAt: Date\.now\(\) \+ remaining \* 1000/);
    expect(source).toMatch(/Math\.ceil\(\(state\.timerEndsAt - Date\.now\(\)\) \/ 1000\)/);
  });

  it("persists a running session instead of silently restoring it paused", () => {
    expect(source).toMatch(/timerRunning: state\.timerRunning/);
    expect(source).toMatch(/timerEndsAt: state\.timerEndsAt/);
  });

  it("advances an expired phase on hydration instead of stranding at 00:00", () => {
    expect(source).toMatch(/if \(corrected === 0\)/);
    expect(source).toMatch(/timerPhase: nextPhaseIndex/);
    expect(source).toMatch(/timerRemainingSeconds: toSeconds\(preset\.phases\[nextPhaseIndex\]\.durationMinutes\)/);
  });
});
