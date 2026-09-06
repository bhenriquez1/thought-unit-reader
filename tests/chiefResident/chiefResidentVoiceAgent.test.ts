// tests/chiefResident/chiefResidentVoiceAgent.test.ts
// CR2 — real function-call tests for the Chief Resident Agent's realtime
// voice request/response shaping. Pure functions only — no fetch, no
// WebRTC; see lib/chiefResident/useChiefResidentVoiceSession.ts for the
// (unavoidably untestable-in-this-sandbox) live connection this wraps.

import {
  buildVoiceSessionInstructions,
  buildVoiceSessionRequest,
  parseVoiceSessionResponse,
  DEFAULT_VOICE_MODEL,
  DEFAULT_VOICE,
  type VoiceSessionSourceContext,
} from "../../lib/chiefResident/chiefResidentVoiceAgent";

const BASE_CTX: VoiceSessionSourceContext = {
  sourceText: "Atoms consist of a nucleus surrounded by electrons.",
};

describe("buildVoiceSessionInstructions", () => {
  it("includes the page source text verbatim, so teaching stays grounded in it", () => {
    const instructions = buildVoiceSessionInstructions(BASE_CTX);
    expect(instructions).toContain(BASE_CTX.sourceText);
  });

  it("includes the CONTENT AUTHORITY discipline", () => {
    const instructions = buildVoiceSessionInstructions(BASE_CTX);
    expect(instructions).toMatch(/CONTENT AUTHORITY/);
  });

  it("instructs no markdown/emoji/headers — this is spoken audio, never rendered", () => {
    const instructions = buildVoiceSessionInstructions(BASE_CTX);
    expect(instructions).toMatch(/never use markdown, emoji, bullet points, or headers/i);
  });

  it("includes title and page number when provided", () => {
    const instructions = buildVoiceSessionInstructions({ ...BASE_CTX, title: "General Chemistry", pageNumber: 42 });
    expect(instructions).toContain('Document: "General Chemistry"');
    expect(instructions).toContain("Page: 42");
  });

  it("omits the audience note for the default 'student' audience", () => {
    const instructions = buildVoiceSessionInstructions({ ...BASE_CTX, audience: "student" });
    expect(instructions).not.toMatch(/learner's level is/);
  });

  it("adds an audience depth note for a non-default audience", () => {
    const instructions = buildVoiceSessionInstructions({ ...BASE_CTX, audience: "child" });
    expect(instructions).toMatch(/learner's level is "child"/);
  });
});

describe("buildVoiceSessionRequest", () => {
  it("defaults to DEFAULT_VOICE_MODEL/DEFAULT_VOICE when no overrides are given", () => {
    const req = buildVoiceSessionRequest(BASE_CTX);
    expect(req.model).toBe(DEFAULT_VOICE_MODEL);
    expect(req.voice).toBe(DEFAULT_VOICE);
  });

  it("honors an explicit model/voice override", () => {
    const req = buildVoiceSessionRequest(BASE_CTX, { model: "custom-realtime-model", voice: "verse" });
    expect(req.model).toBe("custom-realtime-model");
    expect(req.voice).toBe("verse");
  });

  it("requests both audio and text modalities", () => {
    const req = buildVoiceSessionRequest(BASE_CTX);
    expect(req.modalities).toEqual(["audio", "text"]);
  });

  it("configures server-side voice-activity turn detection", () => {
    const req = buildVoiceSessionRequest(BASE_CTX);
    expect(req.turn_detection.type).toBe("server_vad");
    expect(typeof req.turn_detection.threshold).toBe("number");
    expect(typeof req.turn_detection.silence_duration_ms).toBe("number");
  });

  it("embeds the built instructions in the request body", () => {
    const req = buildVoiceSessionRequest(BASE_CTX);
    expect(req.instructions).toContain(BASE_CTX.sourceText);
  });
});

describe("parseVoiceSessionResponse", () => {
  it("parses a well-formed realtime session response", () => {
    const raw = { client_secret: { value: "ek_abc123", expires_at: 1_700_000_000 } };
    const result = parseVoiceSessionResponse(raw, "gpt-4o-realtime-preview", "alloy");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.clientSecret).toBe("ek_abc123");
      expect(result.session.model).toBe("gpt-4o-realtime-preview");
      expect(result.session.voice).toBe("alloy");
      expect(result.session.expiresAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
    }
  });

  it("falls back to a near-future expiry when expires_at is missing", () => {
    const raw = { client_secret: { value: "ek_abc123" } };
    const result = parseVoiceSessionResponse(raw, "m", "v");
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Date(result.session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("fails closed when client_secret.value is missing", () => {
    const result = parseVoiceSessionResponse({ client_secret: {} }, "m", "v");
    expect(result.ok).toBe(false);
  });

  it("fails closed on a null/non-object response", () => {
    expect(parseVoiceSessionResponse(null, "m", "v").ok).toBe(false);
    expect(parseVoiceSessionResponse("not an object", "m", "v").ok).toBe(false);
  });

  it("fails closed when client_secret itself is absent", () => {
    const result = parseVoiceSessionResponse({}, "m", "v");
    expect(result.ok).toBe(false);
  });
});
