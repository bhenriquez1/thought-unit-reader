import { redirect } from "next/navigation";

/** Retired DAT-pattern dashboard. Preserve old bookmarks without exposing a competing TestLab UI. */
export default function LegacyPatternRoute() {
  redirect("/apex");
}
