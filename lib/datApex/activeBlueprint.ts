// lib/datApex/activeBlueprint.ts
// Single pointer to the current active DAT exam blueprint.
//
// When the ADA publishes updated specifications (e.g. Organic Chemistry for 2026):
//   1. Create lib/datApex/blueprints/dat-2026.ts with the new DatExamBlueprint.
//   2. Update ACTIVE_DAT_BLUEPRINT below to import from that file.
//   3. Do NOT edit dat-2025.ts.
//
// All exam construction must import from this file, never from a blueprint file directly.

import { DAT_BLUEPRINT_2025 } from "./blueprints/dat-2025";
import type { DatExamBlueprint } from "./blueprint";

export const ACTIVE_DAT_BLUEPRINT: DatExamBlueprint = DAT_BLUEPRINT_2025;
