// tests/toc/boilerplateFilter.test.ts
// Tests for lib/toc/boilerplateFilter.ts

import {
  isBoilerplate,
  filterBoilerplate,
  scoreTitleCandidate,
  pickBestTitle,
} from "../../lib/toc/boilerplateFilter";

// ── Publisher addresses ───────────────────────────────────────────────────────

describe("isBoilerplate — publisher addresses", () => {
  it("rejects a street address with a zip", () => {
    expect(isBoilerplate("3251 Riverport Lane St. Louis, Missouri 63043")).toBe(true);
  });

  it("rejects a numbered street address", () => {
    expect(isBoilerplate("1600 Amphitheatre Pkwy, Mountain View")).toBe(true);
  });

  it("rejects PO Box lines", () => {
    expect(isBoilerplate("P.O. Box 1800, Philadelphia, PA 19101")).toBe(true);
  });

  it("rejects state + zip patterns", () => {
    expect(isBoilerplate("Philadelphia, Pennsylvania 19106")).toBe(true);
  });

  it("does not reject a normal chapter title with a number", () => {
    expect(isBoilerplate("Chapter 3: Caries Pathology")).toBe(false);
  });
});

// ── ISBN and copyright ────────────────────────────────────────────────────────

describe("isBoilerplate — ISBN and copyright", () => {
  it("rejects ISBN-13 lines", () => {
    expect(isBoilerplate("ISBN 978-0-323-07274-4")).toBe(true);
  });

  it("rejects ISBN-10 lines", () => {
    expect(isBoilerplate("ISBN-10: 0-323-07274-X")).toBe(true);
  });

  it("rejects copyright lines", () => {
    expect(isBoilerplate("© 2024 Elsevier Inc. All rights reserved.")).toBe(true);
  });

  it("rejects 'All rights reserved' lines", () => {
    expect(isBoilerplate("All rights reserved.")).toBe(true);
  });

  it("rejects 'Copyright' keyword lines", () => {
    expect(isBoilerplate("Copyright 2024 by the American Dental Association")).toBe(true);
  });
});

// ── URLs and publisher domains ────────────────────────────────────────────────

describe("isBoilerplate — URLs and publisher contacts", () => {
  it("rejects http:// URLs", () => {
    expect(isBoilerplate("http://www.elsevier.com/permissions")).toBe(true);
  });

  it("rejects https:// URLs", () => {
    expect(isBoilerplate("https://www.us.elsevierhealth.com")).toBe(true);
  });

  it("rejects www. URLs", () => {
    expect(isBoilerplate("www.elsevier.com")).toBe(true);
  });

  it("rejects elsevier.com domain mentions", () => {
    expect(isBoilerplate("Contact permissions@elsevier.com for licensing")).toBe(true);
  });

  it("rejects Lippincott / Wolters Kluwer mentions", () => {
    expect(isBoilerplate("Wolters Kluwer Health, Philadelphia")).toBe(true);
  });
});

// ── Footer text / legal boilerplate ──────────────────────────────────────────

describe("isBoilerplate — footer / legal lines", () => {
  it("rejects 'Downloaded from' lines", () => {
    expect(isBoilerplate("Downloaded from ClinicalKey.com by Elsevier on March 1, 2024.")).toBe(true);
  });

  it("rejects 'For personal use only' lines", () => {
    expect(isBoilerplate("For personal use only. Not for commercial use.")).toBe(true);
  });

  it("rejects 'Permissions may be sought' lines", () => {
    expect(isBoilerplate("Permissions may be sought directly from Elsevier.")).toBe(true);
  });

  it("rejects 'Uncorrected proof' notices", () => {
    expect(isBoilerplate("UNCORRECTED PROOF — Advance Access Publication")).toBe(true);
  });
});

// ── Page numbers and too-short strings ───────────────────────────────────────

describe("isBoilerplate — page numbers and trivial strings", () => {
  it("rejects bare page numbers", () => {
    expect(isBoilerplate("42")).toBe(true);
    expect(isBoilerplate("1")).toBe(true);
    expect(isBoilerplate("123")).toBe(true);
  });

  it("rejects strings shorter than 3 chars", () => {
    expect(isBoilerplate("Ab")).toBe(true);
    expect(isBoilerplate("")).toBe(true);
  });

  it("rejects strings longer than 200 chars", () => {
    expect(isBoilerplate("A".repeat(201))).toBe(true);
  });
});

// ── Valid chapter/book titles ─────────────────────────────────────────────────

describe("isBoilerplate — valid titles pass through", () => {
  it("accepts a typical chapter title", () => {
    expect(isBoilerplate("Chapter 1 — Diagnosis and Treatment Planning")).toBe(false);
  });

  it("accepts a Part label", () => {
    expect(isBoilerplate("Part I: Functional Occlusion")).toBe(false);
  });

  it("accepts a section title", () => {
    expect(isBoilerplate("Section 3A: Periodontal Disease Classification")).toBe(false);
  });

  it("accepts a book-title-style string", () => {
    expect(isBoilerplate("Essentials of Dental Caries")).toBe(false);
  });

  it("accepts a clinical topic title", () => {
    expect(isBoilerplate("Fluoride and Remineralization")).toBe(false);
  });

  it("accepts an all-caps chapter heading", () => {
    expect(isBoilerplate("PULP BIOLOGY AND PATHOLOGY")).toBe(false);
  });

  it("accepts a subsection title with numbers", () => {
    expect(isBoilerplate("2.3 Acid-Base Balance in Caries Formation")).toBe(false);
  });
});

// ── filterBoilerplate ─────────────────────────────────────────────────────────

describe("filterBoilerplate", () => {
  it("removes boilerplate entries from an array", () => {
    const candidates = [
      "3251 Riverport Lane St. Louis, Missouri 63043",
      "Chapter 1 — Diagnosis",
      "ISBN 978-0-323-07274-4",
      "Part II: Advanced Techniques",
    ];
    const result = filterBoilerplate(candidates);
    expect(result).toEqual(["Chapter 1 — Diagnosis", "Part II: Advanced Techniques"]);
  });

  it("returns empty array when all entries are boilerplate", () => {
    expect(filterBoilerplate(["42", "© 2024", "ISBN 978-0"])).toEqual([]);
  });

  it("returns all entries when none are boilerplate", () => {
    const titles = ["Chapter 1", "Chapter 2", "Part I"];
    expect(filterBoilerplate(titles)).toHaveLength(3);
  });
});

// ── scoreTitleCandidate ───────────────────────────────────────────────────────

describe("scoreTitleCandidate", () => {
  it("returns 0 for boilerplate input", () => {
    expect(scoreTitleCandidate("3251 Riverport Lane St. Louis, Missouri 63043")).toBe(0);
    expect(scoreTitleCandidate("ISBN 978-0-323-07274-4")).toBe(0);
  });

  it("returns > 0 for valid title", () => {
    expect(scoreTitleCandidate("Chapter 1 — Diagnosis")).toBeGreaterThan(0);
  });

  it("scores clinical/textbook title-starters higher", () => {
    const clinical = scoreTitleCandidate("Clinical Essentials of Periodontology");
    const generic  = scoreTitleCandidate("Some topic discussed here");
    expect(clinical).toBeGreaterThanOrEqual(generic);
  });

  it("returns value in 0–10 range", () => {
    const titles = [
      "Chapter 3: Caries",
      "Essentials of Dental Science",
      "Fluoride Treatment",
      "3251 Riverport Lane",
    ];
    for (const t of titles) {
      const score = scoreTitleCandidate(t);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    }
  });
});

// ── pickBestTitle ─────────────────────────────────────────────────────────────

describe("pickBestTitle", () => {
  it("returns null when all candidates are boilerplate", () => {
    expect(pickBestTitle(["3251 Riverport Lane", "© 2024 Elsevier"])).toBeNull();
  });

  it("returns the best non-boilerplate candidate", () => {
    const candidates = [
      "3251 Riverport Lane St. Louis, Missouri 63043",
      "Essentials of Dental Caries",
      "ISBN 978-0-323-07274-4",
    ];
    expect(pickBestTitle(candidates)).toBe("Essentials of Dental Caries");
  });

  it("prefers clinical/essentials titles over generic ones", () => {
    const candidates = ["Some text here", "Clinical Essentials of Oral Pathology"];
    const result = pickBestTitle(candidates);
    expect(result).toBe("Clinical Essentials of Oral Pathology");
  });

  it("returns null for empty input", () => {
    expect(pickBestTitle([])).toBeNull();
  });
});
