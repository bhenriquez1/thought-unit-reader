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
