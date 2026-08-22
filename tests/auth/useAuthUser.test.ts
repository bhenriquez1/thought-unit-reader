// tests/auth/useAuthUser.test.ts
// Product-split Phase 2 — the shared auth-reactive hook. No jsdom/render
// harness in this repo (testEnvironment: "node"), and lib/firebase is
// globally mocked in tests/setup.ts without listenForAuthChanges/
// handleRedirectResult, so this follows the established source-inspection
// pattern used for every other hook/component in this repo.

import fs from "fs";
import path from "path";

const HOOK_FILE = path.resolve(__dirname, "../../lib/auth/useAuthUser.ts");
const APP_FILE = path.resolve(__dirname, "../../pages/_app.tsx");
const INDEX_FILE = path.resolve(__dirname, "../../pages/index.tsx");
const FIREBASE_FILE = path.resolve(__dirname, "../../lib/firebase.ts");

describe("lib/auth/useAuthUser.ts", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(HOOK_FILE, "utf8"); });

  it("REQUIRED: calls the real listenForAuthChanges/handleRedirectResult — never reimplements dev-bypass mock-user handling itself", () => {
    expect(src).toMatch(/import \{ listenForAuthChanges, handleRedirectResult, type User \} from "@\/lib\/firebase";/);
    expect(src).toMatch(/handleRedirectResult\(\)\.catch/);
    expect(src).toMatch(/listenForAuthChanges\(\(u\) => \{/);
    // The function body itself (not this file's explanatory header comment,
    // which names the old behavior it replaces) never branches on the
    // bypass flag or builds its own mock user object.
    const bodyIdx = src.indexOf("export function useAuthUser(): AuthUserState {");
    const body = src.slice(bodyIdx);
    expect(body).not.toMatch(/DISABLE_GOOGLE_SIGNIN/);
    expect(body).not.toMatch(/uid:\s*["']/);
  });

  it("REQUIRED: loading starts true and only flips false inside the real callback — never set false speculatively before Firebase reports back", () => {
    expect(src).toMatch(/const \[loading, setLoading\] = useState\(true\);/);
    const idx = src.indexOf("listenForAuthChanges((u) => {");
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/setUser\(u\);/);
    expect(block).toMatch(/setLoading\(false\);/);
  });

  it("unsubscribes on unmount", () => {
    expect(src).toMatch(/return unsubscribe;/);
  });
});

describe("pages/_app.tsx — uses the shared hook instead of its own subscription", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(APP_FILE, "utf8"); });

  it("REQUIRED: imports useAuthUser, not listenForAuthChanges/handleRedirectResult directly", () => {
    expect(src).toMatch(/import \{ useAuthUser \} from "@\/lib\/auth\/useAuthUser";/);
    expect(src).not.toMatch(/import \{ listenForAuthChanges/);
  });

  it("REQUIRED: the cookie-sync effect waits for loading to resolve before acting — never wipes a real session's cookies during the pre-determination null", () => {
    const idx = src.indexOf("useEffect(() => {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/if \(loading\) return;/);
  });

  it("still syncs rb_uid/rb_token cookies the same way as before", () => {
    expect(src).toMatch(/setCookie\("rb_uid", user\.uid\);/);
    expect(src).toMatch(/deleteCookie\("rb_uid"\);/);
    expect(src).toMatch(/deleteCookie\("rb_token"\);/);
  });
});

describe("pages/index.tsx — uses the shared hook instead of its own drifted bypass logic", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_FILE, "utf8"); });

  it("REQUIRED: imports useAuthUser; no longer imports listenForAuthChanges/handleRedirectResult from lib/firebase itself", () => {
    expect(src).toMatch(/import \{ useAuthUser \} from "@\/lib\/auth\/useAuthUser";/);
    const importBlockIdx = src.indexOf('} from "@/lib/firebase";');
    const importBlock = src.slice(Math.max(0, importBlockIdx - 400), importBlockIdx);
    expect(importBlock).not.toMatch(/listenForAuthChanges/);
    expect(importBlock).not.toMatch(/handleRedirectResult/);
  });

  it("REQUIRED: its own separate dev-bypass mock user ('guest-user-<timestamp>', drifted from lib/firebase.ts's own 'mock-user-dev') is gone", () => {
    expect(src).not.toMatch(/guest-user-/);
    // The one other, unrelated NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN check
    // elsewhere in this file (line ~3925, guest upload/storage behavior) is
    // untouched by this change — only the auth-listener effect's own copy
    // of this flag (and its mock user) is what's required gone here.
    const authSectionIdx = src.indexOf("const { user } = useAuthUser();");
    expect(authSectionIdx).toBeGreaterThan(-1);
    const nearbyBlock = src.slice(authSectionIdx, authSectionIdx + 200);
    expect(nearbyBlock).not.toMatch(/DISABLE_GOOGLE_SIGNIN/);
  });

  it("still imports signInWithGoogle/signOutUser from lib/firebase directly — only the reactive subscription moved, not the sign-in/out actions", () => {
    const idx = src.indexOf("} from \"@/lib/firebase\";");
    const block = src.slice(Math.max(0, idx - 400), idx);
    expect(block).toMatch(/signInWithGoogle,/);
    expect(block).toMatch(/signOutUser,/);
  });
});

describe("lib/firebase.ts — listenForAuthChanges auto-logs in during bypass mode (product-split Phase 2 regression fix)", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(FIREBASE_FILE, "utf8"); });

  it("REQUIRED: when bypass mode is on and no mock user is stored yet, it creates AND persists one instead of resolving null — restores the original pre-Phase-2 Reader behavior (zero-click auto-login) for every caller of the shared listener, not just the Reader", () => {
    const fnIdx = src.indexOf("export function listenForAuthChanges(");
    expect(fnIdx).toBeGreaterThan(-1);
    const checkIdx = src.indexOf("const checkCurrentAuthState = ()", fnIdx);
    const initIdx = src.indexOf("setTimeout(() => callback(currentUser), 0);", checkIdx);
    expect(checkIdx).toBeGreaterThan(-1);
    expect(initIdx).toBeGreaterThan(checkIdx);
    const block = src.slice(checkIdx, initIdx + 60);
    expect(block).toMatch(/let currentUser = checkCurrentAuthState\(\);/);
    expect(block).toMatch(/if \(!currentUser\) \{/);
    expect(block).toMatch(/localStorage\.setItem\("mock-auth-user", JSON\.stringify\(\{/);
    expect(block).toMatch(/currentUser = autoUser;/);
  });

  it("persists the same shape signInWithGoogle's own bypass branch stores (uid/email/displayName), so an explicit sign-in afterward is a no-op, not a conflicting second mock identity", () => {
    const fnIdx = src.indexOf("export function listenForAuthChanges(");
    const block = src.slice(fnIdx, fnIdx + 3200);
    expect(block).toMatch(/uid: autoUser\.uid,/);
    expect(block).toMatch(/email: autoUser\.email,/);
    expect(block).toMatch(/displayName: autoUser\.displayName,/);
  });

  it("an explicit signOutUser() in bypass mode still works — it removes mock-auth-user and dispatches mock-auth-change, which the already-mounted listener's event handler (not checkCurrentAuthState) picks up live", () => {
    const idx = src.indexOf("export async function signOutUser(): Promise<void> {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/localStorage\.removeItem\("mock-auth-user"\);/);
    expect(block).toMatch(/type: 'mock-signout'/);
  });
});
