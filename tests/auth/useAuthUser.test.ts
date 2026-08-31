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

  it("REQUIRED: calls the real listenForAuthChanges/handleRedirectResult", () => {
    expect(src).toMatch(/import \{ listenForAuthChanges, handleRedirectResult, type User \} from "@\/lib\/firebase";/);
    expect(src).toMatch(/handleRedirectResult\(\)\.catch/);
    expect(src).toMatch(/listenForAuthChanges\(\(u\) => \{/);
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

  it("REQUIRED: has no development-user auth bypass", () => {
    expect(src).not.toMatch(/guest-user-/);
    expect(src).not.toMatch(/NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN/);
  });

  it("still imports signInWithGoogle/signOutUser from lib/firebase directly — only the reactive subscription moved, not the sign-in/out actions", () => {
    const idx = src.indexOf("} from \"@/lib/firebase\";");
    const block = src.slice(Math.max(0, idx - 400), idx);
    expect(block).toMatch(/signInWithGoogle,/);
    expect(block).toMatch(/signOutUser,/);
  });
});

describe("lib/firebase.ts — production Firebase authentication", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(FIREBASE_FILE, "utf8"); });

  it("uses Firebase onAuthStateChanged and contains no development-user fallback", () => {
    expect(src).toMatch(/return onAuthStateChanged\(authInstance, callback\);/);
    expect(src).not.toMatch(/mock-user-dev/);
    expect(src).not.toMatch(/mock-auth-user/);
    expect(src).not.toMatch(/NEXT_PUBLIC_DISABLE_GOOGLE_SIGNIN/);
  });

  it("signs in with the Google provider and persists a user profile", () => {
    expect(src).toMatch(/const provider = new GoogleAuthProvider\(\);/);
    expect(src).toMatch(/signInWithPopup\(authInstance, provider\)/);
    expect(src).toMatch(/signInWithRedirect\(authInstance, provider\)/);
    expect(src).toMatch(/await ensureUserProfile\(result\.user\);/);
  });

  it("signs out through Firebase Auth", () => {
    expect(src).toMatch(/await signOut\(authInstance\);/);
  });
});
