// Pronunciation with the browser's built-in text-to-speech voices — no model,
// no network request, no key. Track one utterance at a time so buttons act
// like a preview, not a chorus.

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** Speak some text; whatever is currently playing is replaced. */
export function speak(text: string): void {
  if (!speechSupported() || !text.trim()) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}

const AUTO_KEY = 'recall.autospeak'

/** Whether new cards are pronounced automatically, persisted per browser. */
export function autoSpeak(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}

export function setAutoSpeak(on: boolean): void {
  try {
    if (on) localStorage.setItem(AUTO_KEY, '1')
    else localStorage.removeItem(AUTO_KEY)
  } catch {
    /* storage unavailable (private mode) — the toggle just won't persist */
  }
}
