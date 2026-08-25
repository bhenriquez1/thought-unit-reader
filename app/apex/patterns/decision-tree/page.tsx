import { redirect } from "next/navigation";

/** Retired pattern route; canonical TestLab starts from a grounded Reader source. */
export default function LegacyDecisionTreeRoute() {
  redirect("/apex");
}
