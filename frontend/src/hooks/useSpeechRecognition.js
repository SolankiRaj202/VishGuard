/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useCallback } from 'react'

/**
 * useSpeechRecognition
 *
 * A mobile-safe React hook that wraps the browser's Web Speech API
 * (`SpeechRecognition` / `webkitSpeechRecognition`).
 *
 * ## Why a custom hook?
 * The native API has several rough edges on mobile:
 *  - Android Chrome **stops automatically** after a pause in speech, requiring
 *    manual restart via `onend`.
 *  - `not-allowed` (mic denied) is permanent and must be surfaced to the user,
 *    while transient errors (`no-speech`, `network`, `audio-capture`, `aborted`)
 *    should be silently retried.
 *  - If the screen locks mid-call the recognition session silently dies; we
 *    re-start it on `visibilitychange` when the screen turns back on.
 *
 * ## Usage
 * ```jsx
 * useSpeechRecognition({
 *   isRecording,          // boolean — controls start/stop
 *   onSegment,            // ({ text, timestamp }) => void — called for each final result
 *   onInterim,            // (string) => void — live partial text (clears on session end)
 *   onError,              // (string) => void — user-facing error message
 *   onStatusChange,       // ('listening' | 'restarting' | null) => void
 * })
 * ```
 *
 * @param {object}   options
 * @param {boolean}  options.isRecording    - When true the hook starts recognition; false stops it.
 * @param {Function} options.onSegment      - Called with `{ text, timestamp }` for each final transcript segment.
 * @param {Function} [options.onInterim]    - Called with the current interim (partial) transcript string.
 * @param {Function} [options.onError]      - Called with a user-friendly error message string on permanent errors.
 * @param {Function} [options.onStatusChange] - Called with `'listening'`, `'restarting'`, or `null`.
 */
export default function useSpeechRecognition({
  isRecording,
  onSegment,
  onInterim,
  onError,
  onStatusChange,
}) {
  const recognitionRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

  // ── Teardown helper ───────────────────────────────────────────────────────
  /**
   * Nulls out all event handlers and aborts the current recognition session.
   * Handlers are cleared first to prevent the `onend` callback from triggering
   * another unwanted restart cycle after an explicit stop.
   */
  const stopRecognition = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
      restartTimeoutRef.current = null
    }
    if (recognitionRef.current) {
      // Null out handlers FIRST to prevent the onend restart loop from firing
      recognitionRef.current.onstart = null
      recognitionRef.current.onresult = null
      recognitionRef.current.onerror = null
      recognitionRef.current.onend = null
      try { recognitionRef.current.abort() } catch (_) {}
      recognitionRef.current = null
    }
  }, [])

  // ── Core recognition starter ──────────────────────────────────────────────
  /**
   * Creates and starts a new SpeechRecognition instance.
   * - `continuous = true` is set, but Android may still fire `onend` after
   *   silence — the `onend` handler re-calls `startRecognition` after 300 ms.
   * - `interimResults = true` enables live partial results via `onInterim`.
   * - Language is intentionally NOT forced (`recognition.lang`) so the device
   *   uses its OS locale, giving accurate results for multilingual users.
   */
  const startRecognition = useCallback(() => {
    if (!isRecordingRef.current) return

    // Bail early if SR not supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    // Clean up any existing instance before creating a new one
    if (recognitionRef.current) {
      recognitionRef.current.onstart = null
      recognitionRef.current.onresult = null
      recognitionRef.current.onerror = null
      recognitionRef.current.onend = null
      try { recognitionRef.current.abort() } catch (_) {}
    }

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    // continuous=true means the browser won't auto-stop after a pause.
    // On some Android builds, continuous mode has bugs — we handle restarts
    // manually via onend instead of relying on it.
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    // Do NOT force recognition.lang — let device use its OS locale so that
    // multilingual users get accurate results without any extra config.

    recognition.onstart = () => {
      onStatusChange?.('listening')
    }

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          const finalText = text.trim()
          if (finalText) {
            onSegment?.({ text: finalText, timestamp: new Date().toISOString() })
          }
          interim = ''
        } else {
          interim += text
        }
      }
      onInterim?.(interim)
    }

    recognition.onerror = (event) => {
      // These are normal transient errors on mobile — don't surface to user
      const silentErrors = ['aborted', 'no-speech', 'network', 'audio-capture']
      if (!silentErrors.includes(event.error)) {
        console.warn('[SpeechRecognition] Unhandled error:', event.error)
      }
      if (event.error === 'not-allowed') {
        // Permanent — user denied mic. Stop everything and notify.
        onError?.('Microphone access denied. Please allow microphone permissions in your browser settings, then reload.')
        isRecordingRef.current = false
        onStatusChange?.(null)
        stopRecognition()
      }
      // For all other errors, onend will fire and trigger the restart loop.
    }

    recognition.onend = () => {
      // Always clear interim text when a recognition session ends
      onInterim?.('')

      if (isRecordingRef.current) {
        onStatusChange?.('restarting')
        // Delay restart slightly:
        //  - 300ms prevents Chrome's "recognition already started" error
        //  - Gives Android OS time to free internal audio buffers
        restartTimeoutRef.current = setTimeout(() => {
          if (isRecordingRef.current) {
            startRecognition()
          }
        }, 300)
      } else {
        onStatusChange?.(null)
      }
    }

    try {
      recognition.start()
    } catch (err) {
      console.warn('[SpeechRecognition] start() threw:', err.message)
      // Retry after a brief pause — usually caused by concurrent start() calls
      restartTimeoutRef.current = setTimeout(() => {
        if (isRecordingRef.current) startRecognition()
      }, 500)
    }
  }, [onSegment, onInterim, onError, onStatusChange, stopRecognition])

  // ── Effect: start/stop when isRecording changes ───────────────────────────
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      onError?.('Live transcription is not supported in this browser. Please use Chrome on Android or Safari on iOS.')
      return
    }

    if (isRecording) {
      startRecognition()
    } else {
      stopRecognition()
      onInterim?.('')
      onStatusChange?.(null)
    }

    return () => {
      stopRecognition()
    }
  }, [isRecording])

  // ── Effect: re-start when page becomes visible (screen unlock on mobile) ──
  /**
   * When the mobile screen locks and then turns back on, the recognition
   * session will have silently died. We listen for `visibilitychange` and
   * force a fresh restart with a 400 ms delay to let the OS settle.
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRecordingRef.current) {
        // Recognition may have silently died while screen was locked
        // Force a fresh restart
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
        restartTimeoutRef.current = setTimeout(startRecognition, 400)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [startRecognition])
}
