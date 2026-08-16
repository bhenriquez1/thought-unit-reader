// tests/examEngine/datClassification.test.ts
// X1 — DAT's classification vocabulary moved out of lib/canonical/types.ts
// into lib/examEngine/datClassification.ts (the exam-engine layer, not the
// shared canonical layer, owns DAT's taxonomy). This is the new home's
// direct behavioral coverage.

import { datSectionFromSubject } from "@/lib/examEngine/datClassification";
import type { DatSection } from "@/lib/examEngine/datClassification";

describe("datSectionFromSubject", () => {
  it("maps Biology to 'biology'", () => {
    expect(datSectionFromSubject("Biology")).toBe("biology");
  });

  it("maps General Chemistry to 'general_chemistry'", () => {
    expect(datSectionFromSubject("General Chemistry")).toBe("general_chemistry");
  });

  it("maps Organic Chemistry to 'organic_chemistry'", () => {
    expect(datSectionFromSubject("Organic Chemistry")).toBe("organic_chemistry");
  });

  it("maps Other to 'none'", () => {
    expect(datSectionFromSubject("Other")).toBe("none");
  });

  it("return type is assignable to DatSection (compile-time check)", () => {
    const section: DatSection = datSectionFromSubject("Biology");
    expect(typeof section).toBe("string");
  });
});
