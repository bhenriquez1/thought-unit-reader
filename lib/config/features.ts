// lib/config/features.ts
// Runtime feature flags.
// Toggle flags here to enable/disable optional integrations without
// removing the underlying architecture.

export const FEATURES = {
  /**
   * Azure Cognitive Services Speech SDK integration.
   * Requires: npm i microsoft-cognitiveservices-speech-sdk
   * Env vars: NEXT_PUBLIC_AZURE_SPEECH_KEY, NEXT_PUBLIC_AZURE_SPEECH_REGION
   *
   * Set to true once the SDK is confirmed installed in the deployment
   * environment and the env vars are configured in Render.
   */
  AZURE_SPEECH: false,
} as const;

export type FeatureFlags = typeof FEATURES;
