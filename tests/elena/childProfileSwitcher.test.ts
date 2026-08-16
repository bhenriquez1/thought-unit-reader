// tests/elena/childProfileSwitcher.test.ts
// Static-analysis coverage for components/elena/ChildProfileSwitcher.tsx —
// surfaces the multi-child support that already existed in
// lib/elena/idbStore.ts (listChildProfiles) but had no UI calling it.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/elena/ChildProfileSwitcher.tsx"),
  "utf8",
);

describe("ChildProfileSwitcher", () => {
  it("REQUIRED: lists profiles via the existing listChildProfiles(parentAccountId) — no new profile-listing logic", () => {
    expect(SRC).toMatch(/import \{ listChildProfiles \} from "@\/lib\/elena\/idbStore";/);
    expect(SRC).toMatch(/listChildProfiles\(parentAccountId\)/);
  });

  it("highlights the active profile distinctly from the others", () => {
    expect(SRC).toMatch(/const isActive = p\.id === activeProfileId;/);
  });

  it("REQUIRED: 'Add another learner' delegates to the caller-supplied add-profile form rather than duplicating SetupForm", () => {
    expect(SRC).toMatch(/renderAddForm: \(onSave: \(profile: ChildProfile\) => void\) => React\.ReactNode;/);
    expect(SRC).toMatch(/\{renderAddForm\(onSelect\)\}/);
  });

  it("gives each profile a deterministic avatar via getAvatarEmoji, not a random/generated one", () => {
    expect(SRC).toMatch(/import \{ getAvatarEmoji \} from "@\/lib\/elena\/avatar";/);
    expect(SRC).toMatch(/getAvatarEmoji\(p\.id\)/);
  });
});
