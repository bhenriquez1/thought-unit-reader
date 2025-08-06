// lib/mnemonicAI.ts

/**
 * Generates a mnemonic for a given piece of text.
 * - If API is available, use it
 * - Otherwise, fall back to a simple mock mnemonic
 */

export async function generateMnemonic(text: string): Promise<string> {
  if (!text || text.trim().length === 0) {
    throw new Error("No text provided for mnemonic generation");
  }

  // --- Try API call first ---
  try {
    const response = await fetch("/api/generateMnemonic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `Create a short, memorable mnemonic for the following text, making it easy to remember:\n\n"${text}"\n\nMnemonic:`
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.mnemonic) {
        return data.mnemonic.trim();
      }
    }
  } catch (err) {
    console.warn("⚠️ Mnemonic API not available, using mock instead:", err);
  }

  // --- Fallback mock ---
  const words = text.split(/\s+/).slice(0, 5).join(" ");
  return `Memory Hook → ${words.toUpperCase()} helps recall the main idea.`;
}