// tests/chiefResident/chiefResidentVoiceWiring.test.ts
// CR2 — wiring checks: the ephemeral-session API route never leaks the real
// OPENAI_API_KEY to the client and delegates its request/response shaping
// to the pure agent module; the WebRTC hook registers with the shared
// speech controller; ChiefResidentPanel.tsx offers a "Talk Live" entry
// point wired to it. Static source analysis — the established pattern in
// this codebase (see tests/reader/chiefResidentConsolidation.test.ts).

import fs from "fs";
import path from "path";

const API_FILE       = path.resolve(__dirname, "../../pages/api/chief-resident-voice-session.ts");
const HOOK_FILE       = path.resolve(__dirname, "../../lib/chiefResident/useChiefResidentVoiceSession.ts");
const CALL_UI_FILE   = path.resolve(__dirname, "../../components/notelab/ChiefResidentVoiceCall.tsx");
const PANEL_FILE     = path.resolve(__dirname, "../../components/notelab/ChiefResidentPanel.tsx");
const SPEECH_FILE    = path.resolve(__dirname, "../../lib/speech/speechController.ts");

describe("pages/api/chief-resident-voice-session.ts — server-mediated SDP exchange", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(API_FILE, "utf8"); });

  it("reads OPENAI_API_KEY server-side and 503s when missing, matching every other Chief Resident route", () => {
    expect(src).toMatch(/const apiKey = process\.env\.OPENAI_API_KEY;/);
    expect(src).toMatch(/res\.status\(503\)\.json\(\{/);
  });

  it("delegates request building and response validation to the pure agent module", () => {
    expect(src).toMatch(/import \{\s*\n\s*buildVoiceSessionRequest,\s*\n\s*parseVoiceCallAnswer,/);
    expect(src).toMatch(/buildVoiceSessionRequest\(/);
    expect(src).toMatch(/parseVoiceCallAnswer\(raw, model, requestId\)/);
  });

  it("never returns the raw apiKey in a response — only the parsed SDP answer", () => {
    expect(src).not.toMatch(/res\.status\(200\)\.json\(\{[^}]*apiKey/);
    expect(src).toMatch(/return res\.status\(200\)\.json\(parsed\.answer\);/);
  });

  it("calls OpenAI's current realtime calls endpoint with a server-side bearer token", () => {
    expect(src).toMatch(/https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
    expect(src).toMatch(/Authorization: `Bearer \$\{apiKey\}`/);
  });

  it("bounds the upstream call with a timeout via AbortController", () => {
    expect(src).toMatch(/AbortController/);
    expect(src).toMatch(/SESSION_TIMEOUT_MS/);
  });
});

describe("lib/chiefResident/useChiefResidentVoiceSession.ts — WebRTC lifecycle + speech coordination", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("registers with the shared speech controller so voice and other narration can never overlap", () => {
    expect(src).toMatch(/import \{\s*\n\s*claimSpeech,\s*\n\s*registerActiveAudio,\s*\n\s*notifySpeechStart,\s*\n\s*notifySpeechEnd,\s*\n\s*notifySpeechError,\s*\n\s*isSpeechStale,\s*\n\} from "@\/lib\/speech\/speechController";/);
    expect(src).toMatch(/const SPEECH_OWNER = "chief-resident-voice" as const;/);
    expect(src).toMatch(/const token = claimSpeech\(SPEECH_OWNER\);/);
  });

  it("stops the mic and closes the peer connection on cleanup — never leaves a live mic open", () => {
    const idx = src.indexOf("const cleanup = useCallback");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/micStreamRef\.current\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\);/);
    expect(block).toMatch(/pcRef\.current\?\.close\(\);/);
  });

  it("runs cleanup on unmount as a safety net", () => {
    expect(src).toMatch(/useEffect\(\(\) => \(\) => cleanup\(\), \[cleanup\]\);/);
  });

  it("sends the browser SDP offer only to Avrrio's own route", () => {
    const fetchOwnRoute = src.indexOf('fetch("/api/chief-resident-voice-session"');
    expect(fetchOwnRoute).toBeGreaterThan(-1);
    expect(src).toMatch(/JSON\.stringify\(\{ \.\.\.ctx, sdp: offer\.sdp \}\)/);
  });

  it("never receives a credential or calls OpenAI directly", () => {
    expect(src).not.toMatch(/clientSecret|Authorization|api\.openai\.com/);
    expect(src).not.toMatch(/process\.env/);
  });
});

describe("components/notelab/ChiefResidentVoiceCall.tsx — driven entirely by the hook", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CALL_UI_FILE, "utf8"); });

  it("imports and calls useChiefResidentVoiceSession rather than owning WebRTC state itself", () => {
    expect(src).toMatch(/import \{ useChiefResidentVoiceSession \} from "@\/lib\/chiefResident\/useChiefResidentVoiceSession";/);
    expect(src).toMatch(/useChiefResidentVoiceSession\(\);/);
  });

  it("connects on mount and disconnects on unmount", () => {
    expect(src).toMatch(/connect\(sourceContext\);/);
    expect(src).toMatch(/return \(\) => disconnect\(\);/);
  });
});

describe("components/notelab/ChiefResidentPanel.tsx — Talk Live entry point wired to the voice call", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(PANEL_FILE, "utf8"); });

  it("imports ChiefResidentVoiceCall", () => {
    expect(src).toMatch(/import ChiefResidentVoiceCall from "@\/components\/notelab\/ChiefResidentVoiceCall";/);
  });

  it("renders the voice call, short-circuiting the rest of the panel, when voiceCallActive is true", () => {
    const idx = src.indexOf("if (voiceCallActive) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/<ChiefResidentVoiceCall/);
    expect(block).toMatch(/onExit=\{\(\) => setVoiceCallActive\(false\)\}/);
  });

  it("resets voiceCallActive alongside the rest of session state when the page/book changes", () => {
    const idx = src.indexOf("// Reset session when page/book changes");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/setVoiceCallActive\(false\);/);
  });

  it("the Talk Live button appears before the text-mode picker, not nested inside a specific mode", () => {
    const talkLiveIdx = src.indexOf("Talk Live");
    const modesMapIdx = src.indexOf("MODES.map(m =>");
    expect(talkLiveIdx).toBeGreaterThan(-1);
    expect(talkLiveIdx).toBeLessThan(modesMapIdx);
  });
});

describe("lib/speech/speechController.ts — chief-resident-voice is a recognized owner", () => {
  it("SpeechOwner includes chief-resident-voice", () => {
    const src = fs.readFileSync(SPEECH_FILE, "utf8");
    expect(src).toMatch(/"chief-resident-voice"/);
  });
});
