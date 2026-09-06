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

describe("pages/api/chief-resident-voice-session.ts — ephemeral token minting only", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(API_FILE, "utf8"); });

  it("reads OPENAI_API_KEY server-side and 503s when missing, matching every other Chief Resident route", () => {
    expect(src).toMatch(/const apiKey = process\.env\.OPENAI_API_KEY;/);
    expect(src).toMatch(/res\.status\(503\)\.json\(\{/);
  });

  it("delegates request building and response validation to the pure agent module", () => {
    expect(src).toMatch(/import \{\s*\n\s*buildVoiceSessionRequest,\s*\n\s*parseVoiceSessionResponse,/);
    expect(src).toMatch(/buildVoiceSessionRequest\(/);
    expect(src).toMatch(/parseVoiceSessionResponse\(raw, model, voice\)/);
  });

  it("never returns the raw apiKey in a response — only the parsed ephemeral session object", () => {
    expect(src).not.toMatch(/res\.status\(200\)\.json\(\{[^}]*apiKey/);
    expect(src).toMatch(/return res\.status\(200\)\.json\(parsed\.session\);/);
  });

  it("calls OpenAI's realtime session endpoint with a bearer token, not a query-string key", () => {
    expect(src).toMatch(/https:\/\/api\.openai\.com\/v1\/realtime\/sessions/);
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

  it("fetches an ephemeral session from our own API route before opening any connection to OpenAI directly", () => {
    const fetchOwnRoute = src.indexOf('fetch("/api/chief-resident-voice-session"');
    const fetchOpenAI = src.indexOf("REALTIME_BASE_URL");
    expect(fetchOwnRoute).toBeGreaterThan(-1);
    expect(fetchOpenAI).toBeGreaterThan(-1);
    expect(fetchOwnRoute).toBeLessThan(src.indexOf(`\${REALTIME_BASE_URL}`));
  });

  it("authenticates the direct OpenAI connection with the ephemeral clientSecret, never reads process.env itself", () => {
    expect(src).toMatch(/Authorization: `Bearer \$\{session\.clientSecret\}`/);
    expect(src).not.toMatch(/process\.env/);
  });

  it("CR3: validates a function-call event through the pure agent module, never inlining its own parsing", () => {
    expect(src).toMatch(/import \{\s*\n\s*parseRealtimeDelegationToolCall,\s*\n\s*shouldOfferDelegation,/);
    expect(src).toMatch(/msg\.type === "response\.output_item\.done" && msg\.item\?\.type === "function_call"/);
    expect(src).toMatch(/parseRealtimeDelegationToolCall\(name, rawArguments\)/);
  });

  it("CR3: gates a valid tool call through the same once-per-session offer check as the text mode", () => {
    expect(src).toMatch(/const offeredDelegationsRef = useRef<Set<ChiefResidentDelegationTarget>>\(new Set\(\)\);/);
    expect(src).toMatch(/shouldOfferDelegation\(parsed\.target, offeredDelegationsRef\.current\)/);
  });

  it("CR3: always acknowledges the tool call back to the model, offered or not, so its turn never hangs", () => {
    const idx = src.indexOf("const acknowledgeToolCall");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/type: "conversation\.item\.create"/);
    expect(block).toMatch(/type: "function_call_output"/);
    expect(block).toMatch(/type: "response\.create"/);
    // Both the not-offered and offered paths must call it.
    const calls = src.match(/acknowledgeToolCall\(callId,/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("CR3: resets delegation state and the offer set on every new connect()", () => {
    const idx = src.indexOf("const connect = useCallback");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/setDelegation\(null\);/);
    expect(block).toMatch(/offeredDelegationsRef\.current = new Set\(\);/);
  });
});

describe("components/notelab/ChiefResidentVoiceCall.tsx — driven entirely by the hook", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(CALL_UI_FILE, "utf8"); });

  it("imports and calls useChiefResidentVoiceSession rather than owning WebRTC state itself", () => {
    expect(src).toMatch(/import \{ useChiefResidentVoiceSession \} from "@\/lib\/chiefResident\/useChiefResidentVoiceSession";/);
    expect(src).toMatch(/const \{ status, error, transcript, isMuted, delegation, connect, disconnect, toggleMute \} = useChiefResidentVoiceSession\(\);/);
  });

  it("connects on mount and disconnects on unmount", () => {
    expect(src).toMatch(/connect\(sourceContext\);/);
    expect(src).toMatch(/return \(\) => disconnect\(\);/);
  });

  it("CR3: renders the delegation card and reuses the same composeNoteNotebookSceneInBackground pipeline as the text mode", () => {
    expect(src).toMatch(/\{delegation && \(/);
    expect(src).toMatch(/import \{ composeNoteNotebookSceneInBackground \} from "@\/lib\/notelab\/composeNotebookScene";/);
    expect(src).toMatch(/await composeNoteNotebookSceneInBackground\(activeNote, activeNote\.documentId \?\? activeNote\.bookId\);/);
  });

  it("CR3: a whiteboard delegation is rendered as a signal only — no direct call into the Whiteboard Artist Agent", () => {
    expect(src).not.toMatch(/runWhiteboardArtistStep/);
  });

  it("CR3: accepts activeNote as a prop, required for the NoteLab delegation action to do anything", () => {
    expect(src).toMatch(/activeNote: UltraNote \| null;/);
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

  it("CR3: passes activeNote through to the voice call, so its delegation action can compose a real note", () => {
    const idx = src.indexOf("if (voiceCallActive) {");
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/activeNote=\{activeNote\}/);
  });
});

describe("lib/speech/speechController.ts — chief-resident-voice is a recognized owner", () => {
  it("SpeechOwner includes chief-resident-voice", () => {
    const src = fs.readFileSync(SPEECH_FILE, "utf8");
    expect(src).toMatch(/"chief-resident-voice"/);
  });
});
