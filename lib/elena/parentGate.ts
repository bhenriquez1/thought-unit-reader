// lib/elena/parentGate.ts
// P0 fix — the Parent dashboard used to open on a single unauthenticated tap
// from the child-visible workspace header (setShowParent(true), no check of
// any kind). This is the family-level PIN gate that sits in front of it now:
// one PIN per parentAccountId, salted and SHA-256 hashed via Web Crypto —
// the raw PIN is never persisted, only ever held in a component's local
// state for the duration of a single entry/creation attempt.
//
// Deliberately NOT the full ParentControlSettings (lib/elena/types.ts) —
// time limits and content-safety policy are separate, larger follow-on work.
// This module's only job is making "can this person see the Parent
// dashboard" a real question with a real answer.

import { loadParentGate, saveParentGate } from "./idbStore";
import type { ParentGateRecord } from "./types";

const PIN_LENGTH = 4;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return toHex(digest);
}

export async function hasParentPin(parentAccountId: string): Promise<boolean> {
  const record = await loadParentGate(parentAccountId);
  return record !== null;
}

export async function setParentPin(parentAccountId: string, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`PIN must be exactly ${PIN_LENGTH} digits`);
  const salt = crypto.randomUUID();
  const pinHash = await hashPin(pin, salt);
  const now = new Date().toISOString();
  const record: ParentGateRecord = { parentAccountId, pinHash, salt, createdAt: now, updatedAt: now };
  await saveParentGate(record);
}

export async function verifyParentPin(parentAccountId: string, pin: string): Promise<boolean> {
  const record = await loadParentGate(parentAccountId);
  if (!record) return false;
  const candidateHash = await hashPin(pin, record.salt);
  return candidateHash === record.pinHash;
}

/* ─── Enrollment gate ─────────────────────────────────────────────────────────
 * P1 fix — "no PIN record exists yet" used to be treated as authorization to
 * create one: the child-visible Parent button led straight into "pick a PIN"
 * for whoever tapped it first, self-authorizing into the dashboard on a
 * fresh/upgraded install (or after any transient IDB read failure, which
 * also fell through to create mode). A real identity check isn't available
 * here (this is a local, backend-less app), so this is the same standard
 * mitigation apps aimed at kids use before letting a session self-provision
 * something a parent should own — the app's own COPPA-style "parental
 * gate": a simple arithmetic question a young child is unlikely to solve.
 * It's not meant to stop a determined adult impostor; it stops the much
 * more likely case — a child tapping around and landing on PIN creation
 * by accident. */

export interface GateChallenge {
  a: number;
  b: number;
}

/** Two double-digit addends — simple for an adult, non-trivial for a young
 *  child. Not cryptographic; see the module comment above. */
export function generateGateChallenge(): GateChallenge {
  const a = 10 + Math.floor(Math.random() * 40);
  const b = 10 + Math.floor(Math.random() * 40);
  return { a, b };
}

export function verifyGateChallenge(challenge: GateChallenge, answer: string): boolean {
  const parsed = Number(answer.trim());
  if (!Number.isFinite(parsed)) return false;
  return parsed === challenge.a + challenge.b;
}
