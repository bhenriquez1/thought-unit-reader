// types/shims-jspdf.d.ts
declare module "jspdf" {
  // Minimal shim so TS stops complaining. You can flesh this out later if you like.
  export const jsPDF: any;
  const _default: any;
  export default _default;
}