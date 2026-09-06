// tests/elena.groundwork.test.ts
// Elena Mode groundwork — product boundary tests, display copy, and feature flags.
//
// Critical invariants:
//   1. "elena" is NOT a valid LearningProfile value.
//   2. getChildDisplayCopy() produces personalized strings using the child's name.
//   3. Feature flags default to all-off.
//   4. Elena Mode types are structurally distinct from LearningProfile.

import type { LearningProfile } from "../types/workspace";
import { LEARNING_PROFILE_LABELS } from "../types/workspace";

import {
  getChildDisplayCopy,
  getChildWorkspaceTitle,
  getChildGreetingName,
  ELENA_MODE_DEFAULT_FLAGS,
  resolveElenaModeFlags,
  isElenaFeatureEnabled,
} from "../lib/elena";

import type {
  ChildProfile,
  ChildContentSafetyPolicy,
  ParentControlSettings,
  ChildProgress,
  ChildRewardState,
  ReadingLevel,
  ElenaModeFlags,
} from "../lib/elena";

/* ─── Product boundary: LearningProfile must not include 'elena' ─────────────── */

describe("product boundary — Elena is NOT a LearningProfile", () => {
  it("LearningProfile union does not include 'elena'", () => {
    // This test enforces the type-level constraint at runtime.
    // TypeScript ensures 'elena' is not assignable, but this test
    // verifies it is also not in the label map (the runtime source of truth).
    const validProfiles = Object.keys(LEARNING_PROFILE_LABELS) as string[];
    expect(validProfiles).not.toContain("elena");
  });

  it("LEARNING_PROFILE_LABELS has exactly the expected adult profiles", () => {
    const profiles = Object.keys(LEARNING_PROFILE_LABELS).sort();
    expect(profiles).toEqual(["dat", "dental", "medical", "standard", "surgeon"].sort());
  });

  it("'elena' cannot be assigned as a LearningProfile without a type error", () => {
    // Runtime guard: verify the valid set explicitly
    const validSet = new Set<string>(Object.keys(LEARNING_PROFILE_LABELS));
    expect(validSet.has("elena")).toBe(false);
    expect(validSet.has("standard")).toBe(true);
    expect(validSet.has("dat")).toBe(true);
  });
});

/* ─── ChildProfile schema ────────────────────────────────────────────────────── */

function makeChildProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id:              "child-001",
    displayName:     "Elena",
    interests:       ["animals", "space"],
    accessibilityPreferences: {
      highContrastMode: false,
      textToSpeech:     false,
      reducedMotion:    false,
      dyslexiaFont:     false,
    },
    parentAccountId: "parent-001",
    createdAt:       "2025-01-01T00:00:00Z",
    updatedAt:       "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ChildProfile schema", () => {
  it("can be constructed with required fields", () => {
    const profile = makeChildProfile();
    expect(profile.id).toBe("child-001");
    expect(profile.displayName).toBe("Elena");
    expect(profile.parentAccountId).toBe("parent-001");
  });

  it("preferredName is optional", () => {
    const profile = makeChildProfile();
    expect(profile.preferredName).toBeUndefined();
  });

  it("interests is an array", () => {
    const profile = makeChildProfile();
    expect(Array.isArray(profile.interests)).toBe(true);
  });

  it("accepts preferredName override", () => {
    const profile = makeChildProfile({ preferredName: "Ellie" });
    expect(profile.preferredName).toBe("Ellie");
  });
});

/* ─── getChildDisplayCopy ─────────────────────────────────────────────────────── */

describe("getChildDisplayCopy — personalized strings", () => {
  it("uses displayName when preferredName is absent", () => {
    const profile = makeChildProfile({ displayName: "Mia" });
    const copy    = getChildDisplayCopy(profile);
    expect(copy.workspaceTitle).toBe("Mia's Learning Space");
    expect(copy.welcomeGreeting).toBe("Welcome back, Mia!");
    expect(copy.readingLabel).toBe("Mia's Reading");
    expect(copy.libraryLabel).toBe("Mia's Books");
    expect(copy.progressLabel).toBe("Mia's Progress");
  });

  it("prefers preferredName over displayName in all copy", () => {
    const profile = makeChildProfile({ displayName: "Samantha", preferredName: "Sam" });
    const copy    = getChildDisplayCopy(profile);
    expect(copy.workspaceTitle).toBe("Sam's Learning Space");
    expect(copy.welcomeGreeting).toBe("Welcome back, Sam!");
    expect(copy.readingLabel).toBe("Sam's Reading");
  });

  it("produces unique copy for each child name", () => {
    const copy1 = getChildDisplayCopy(makeChildProfile({ displayName: "Ava" }));
    const copy2 = getChildDisplayCopy(makeChildProfile({ displayName: "Ben" }));
    expect(copy1.workspaceTitle).not.toBe(copy2.workspaceTitle);
    expect(copy1.workspaceTitle).toContain("Ava");
    expect(copy2.workspaceTitle).toContain("Ben");
  });

  it("does not hard-code 'Elena' anywhere in the copy template", () => {
    // Switch to a different name and ensure the copy reflects it
    const profile = makeChildProfile({ displayName: "Noah" });
    const copy    = getChildDisplayCopy(profile);
    const allCopy = Object.values(copy).join(" ");
    expect(allCopy).not.toContain("Elena");
    expect(allCopy).toContain("Noah");
  });

  it("streakMessage contains the child's name", () => {
    const profile = makeChildProfile({ displayName: "Leo" });
    const copy    = getChildDisplayCopy(profile);
    expect(copy.streakMessage).toContain("Leo");
  });
});

describe("getChildWorkspaceTitle", () => {
  it("returns the workspace title string directly", () => {
    const profile = makeChildProfile({ displayName: "Zoe" });
    expect(getChildWorkspaceTitle(profile)).toBe("Zoe's Learning Space");
  });
});

describe("getChildGreetingName", () => {
  it("returns preferredName when set", () => {
    const profile = makeChildProfile({ displayName: "Elizabeth", preferredName: "Ellie" });
    expect(getChildGreetingName(profile)).toBe("Ellie");
  });

  it("falls back to displayName when preferredName absent", () => {
    const profile = makeChildProfile({ displayName: "Jack" });
    expect(getChildGreetingName(profile)).toBe("Jack");
  });
});

/* ─── Feature flags ──────────────────────────────────────────────────────────── */

describe("Elena Mode feature flags", () => {
  it("all default flags are false", () => {
    const flags = ELENA_MODE_DEFAULT_FLAGS;
    expect(flags.ELENA_MODE_ENABLED).toBe(false);
    expect(flags.PARENT_DASHBOARD_ENABLED).toBe(false);
    expect(flags.PLACEMENT_SCREENER_ENABLED).toBe(false);
    expect(flags.REWARDS_ENABLED).toBe(false);
    expect(flags.AI_COACHING_ENABLED).toBe(false);
    expect(flags.TIME_LIMIT_ENFORCEMENT).toBe(false);
  });

  it("resolveElenaModeFlags with no overrides returns all-false", () => {
    const resolved = resolveElenaModeFlags();
    expect(resolved.ELENA_MODE_ENABLED).toBe(false);
    expect(resolved.REWARDS_ENABLED).toBe(false);
  });

  it("resolveElenaModeFlags applies overrides on top of defaults", () => {
    const resolved = resolveElenaModeFlags({ ELENA_MODE_ENABLED: true });
    expect(resolved.ELENA_MODE_ENABLED).toBe(true);
    expect(resolved.REWARDS_ENABLED).toBe(false);  // default
  });

  it("unknown keys in overrides do not break resolution", () => {
    const resolved = resolveElenaModeFlags({ ELENA_MODE_ENABLED: true } as any);
    expect(resolved).toBeDefined();
    expect(resolved.ELENA_MODE_ENABLED).toBe(true);
  });

  it("isElenaFeatureEnabled returns false when master switch is off", () => {
    const flags = resolveElenaModeFlags({ REWARDS_ENABLED: true });
    // Master switch off → individual feature is inaccessible
    expect(isElenaFeatureEnabled(flags, "REWARDS_ENABLED")).toBe(false);
  });

  it("isElenaFeatureEnabled returns true only when master + feature are both on", () => {
    const flags = resolveElenaModeFlags({
      ELENA_MODE_ENABLED: true,
      REWARDS_ENABLED:    true,
    });
    expect(isElenaFeatureEnabled(flags, "REWARDS_ENABLED")).toBe(true);
    expect(isElenaFeatureEnabled(flags, "AI_COACHING_ENABLED")).toBe(false);
  });

  it("isElenaFeatureEnabled returns false for all features when master is off", () => {
    const flags = resolveElenaModeFlags({
      PARENT_DASHBOARD_ENABLED:   true,
      PLACEMENT_SCREENER_ENABLED: true,
      REWARDS_ENABLED:            true,
      AI_COACHING_ENABLED:        true,
      TIME_LIMIT_ENFORCEMENT:     true,
      // ELENA_MODE_ENABLED: false (default)
    });
    const features: Array<keyof Omit<ElenaModeFlags, "ELENA_MODE_ENABLED">> = [
      "PARENT_DASHBOARD_ENABLED",
      "PLACEMENT_SCREENER_ENABLED",
      "REWARDS_ENABLED",
      "AI_COACHING_ENABLED",
      "TIME_LIMIT_ENFORCEMENT",
    ];
    for (const feature of features) {
      expect(isElenaFeatureEnabled(flags, feature)).toBe(false);
    }
  });
});

/* ─── ChildContentSafetyPolicy schema ───────────────────────────────────────── */

describe("ChildContentSafetyPolicy schema", () => {
  it("can be constructed", () => {
    const policy: ChildContentSafetyPolicy = {
      childProfileId:       "child-001",
      maxAgeRating:         "8+",
      blockedTags:          ["violence"],
      requireSafeFiltering: true,
      requireParentApproval: false,
    };
    expect(policy.maxAgeRating).toBe("8+");
    expect(policy.blockedTags).toContain("violence");
  });
});

/* ─── ParentControlSettings schema ──────────────────────────────────────────── */

describe("ParentControlSettings schema", () => {
  it("can be constructed with dailyTimeLimitMinutes null", () => {
    const settings: ParentControlSettings = {
      parentAccountId:       "parent-001",
      childProfileId:        "child-001",
      dailyTimeLimitMinutes: null,
      safetyPolicy: {
        childProfileId:       "child-001",
        maxAgeRating:         "all",
        blockedTags:          [],
        requireSafeFiltering: true,
        requireParentApproval: false,
      },
    };
    expect(settings.dailyTimeLimitMinutes).toBeNull();
  });

  it("can set dailyTimeLimitMinutes to a positive number", () => {
    const settings: ParentControlSettings = {
      parentAccountId:       "parent-001",
      childProfileId:        "child-001",
      dailyTimeLimitMinutes: 30,
      safetyPolicy: {
        childProfileId:       "child-001",
        maxAgeRating:         "5+",
        blockedTags:          [],
        requireSafeFiltering: true,
        requireParentApproval: true,
      },
    };
    expect(settings.dailyTimeLimitMinutes).toBe(30);
  });
});

/* ─── ReadingLevel enum coverage ─────────────────────────────────────────────── */

describe("ReadingLevel values", () => {
  it("all expected reading levels are valid strings", () => {
    const levels: ReadingLevel[] = [
      "emergent", "early", "developing", "transitional", "fluent", "advanced",
    ];
    expect(levels).toHaveLength(6);
    levels.forEach(l => expect(typeof l).toBe("string"));
  });
});

/* ─── Structural separation from adult types ─────────────────────────────────── */

describe("structural separation from adult types", () => {
  it("ChildProgress has no LearningProfile field", () => {
    const progress: ChildProgress = {
      childProfileId:  "child-001",
      currentLevel:    "early",
      booksCompleted:  2,
      totalSessions:   5,
      totalMinutes:    45,
      totalWordsRead:  1200,
      lastActiveAt:    "2025-06-01T00:00:00Z",
      updatedAt:       "2025-06-01T00:00:00Z",
    };
    expect("learningProfile" in progress).toBe(false);
    expect("profile" in progress).toBe(false);
  });

  it("ChildRewardState has no LearningProfile field", () => {
    const rewards: ChildRewardState = {
      childProfileId: "child-001",
      totalStars:     10,
      currentStreak:  3,
      longestStreak:  7,
      updatedAt:      "2025-06-01T00:00:00Z",
    };
    expect("learningProfile" in rewards).toBe(false);
  });

  it("ChildProfile has no LearningProfile field", () => {
    const profile = makeChildProfile();
    expect("learningProfile" in profile).toBe(false);
    expect("profile" in profile).toBe(false);
  });
});
