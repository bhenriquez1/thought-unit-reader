# Surgeon-View PDRM Control Audit (UI Layer)

| Control | Intended behavior | Broken behavior observed | Root cause | Fix applied | Verification |
|---|---|---|---|---|---|
| Condensed / Expanded | Toggle density and amount of content | Density label changed but content still felt overloaded | View state not tied to category filtering and structural widgets | Connected `view` + `essentialStudentMode` to render strategy; condensed now limits cards and hides heavy maps in default mode | Manual code-path verification and type-check pass |
| Insight zoom A-/A+ | Immediately scale right-panel text only | Potential stale layout perception | No global reset path for combined state failures | Added `resetInsightLayout()` to canonical store to restore zoom + mode + density + sync | Verified through store state transitions |
| Follow scroll | Sync only when enabled and never fight manual mode | Could appear sticky after mode changes | No single emergency reset + no error fallback UX | Reset now forces `followScroll=false`; fallback message includes Retry/Reset view | Verified in control handlers |
| Deep/Quick mode | Reveal advanced intelligence on demand | Advanced layers still surfaced by default | No explicit essential default gate | Added `essentialStudentMode=true` default and “Show deeper reasoning” quick action | Verified by default render paths |
| Reset insight layout | Recover from broken control state | Missing emergency recovery action | No unified reset function | Added explicit "Reset insight layout" control + store-level reset action | Verified action wired in header and fallback banner |
| Toggle failure fallback | Student should not get trapped in stale UI state | No inline recovery prompt | No safe guardrail around control actions | Added inline message: "View didn’t update. Retry or reset?" with Retry + Reset view actions | Verified in panel UI branch |
