// tests/chiefResident/chiefResidentVoiceAgent.test.ts
// CR2 — real function-call tests for the Chief Resident Agent's realtime
// voice request/response shaping. Pure functions only — no fetch, no
// WebRTC; see lib/chiefResident/useChiefResidentVoiceSession.ts for the
// (unavoidably untestable-in-this-sandbox) live connection this wraps.

import {
  buildVoiceSessionInstructions,
  buildVoiceSessionRequest,
  parseVoiceCallAnswer,
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
    expect(req.audio.output.voice).toBe(DEFAULT_VOICE);
  });

  it("honors an explicit model/voice override", () => {
    const req = buildVoiceSessionRequest(BASE_CTX, { model: "custom-realtime-model", voice: "verse" });
    expect(req.model).toBe("custom-realtime-model");
    expect(req.audio.output.voice).toBe("verse");
  });

  it("uses the current realtime session shape with audio output", () => {
    const req = buildVoiceSessionRequest(BASE_CTX);
    expect(req.type).toBe("realtime");
    expect(req.output_modalities).toEqual(["audio"]);
  });

  it("configures server-side voice-activity turn detection", () => {
    const req = buildVoiceSessionRequest(BASE_CTX);
    expect(req.audio.input.turn_detection.type).toBe("server_vad");
    expect(typeof req.audio.input.turn_detection.threshold).toBe("number");
    expect(typeof req.audio.input.turn_detection.silence_duration_ms).toBe("number");
    expect(req.audio.input.turn_detection.create_response).toBe(true);
  });

  it("embeds the built instructions in the request body", () => {
    const req = buildVoiceSessionRequest(BASE_CTX);
    expect(req.instructions).toContain(BASE_CTX.sourceText);
  });
});

describe("parseVoiceCallAnswer", () => {
  it("parses a well-formed SDP answer", () => {
    const raw = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n";
    const result = parseVoiceCallAnswer(raw, "gpt-realtime", "req_123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answer.answerSdp).toBe(raw);
      expect(result.answer.model).toBe("gpt-realtime");
      expect(result.answer.requestId).toBe("req_123");
    }
  });

  it("fails closed when the response is not SDP", () => {
    const result = parseVoiceCallAnswer("not-sdp", "m");
    expect(result.ok).toBe(false);
  });

  it("fails closed on null and object responses", () => {
    expect(parseVoiceCallAnswer(null, "m").ok).toBe(false);
    expect(parseVoiceCallAnswer({}, "m").ok).toBe(false);
  });
});
