// tests/elena/avatar.test.ts

import { getAvatarEmoji } from "@/lib/elena/avatar";

describe("getAvatarEmoji", () => {
  it("is deterministic — the same childProfileId always maps to the same emoji", () => {
    const id = "child-12345";
    expect(getAvatarEmoji(id)).toBe(getAvatarEmoji(id));
  });

  it("returns a non-empty string for any id", () => {
    expect(getAvatarEmoji("").length).toBeGreaterThan(0);
    expect(getAvatarEmoji("child-1").length).toBeGreaterThan(0);
  });

  it("varies across different ids (not a constant)", () => {
    const emojis = new Set(
      Array.from({ length: 20 }, (_, i) => getAvatarEmoji(`child-${i}`)),
    );
    expect(emojis.size).toBeGreaterThan(1);
  });
});
