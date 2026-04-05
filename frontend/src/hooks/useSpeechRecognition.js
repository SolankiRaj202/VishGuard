/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useCallback } from 'react'

export default function useSpeechRecognition({ isRecording, onSegment, onInterim, onError, onStatusChange }) {
  const recognitionRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  const isRecordingRef = useRef(isRecording)
  const interimRef = useRef('')
  isRecordingRef.current = isRecording

  const startRecognition = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
      restartTimeoutRef.current = null
    }
    if (!isRecordingRef.current) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    // Always create fresh instance — avoids stale state issues on mobile
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.continuous = true
    recognition.interimResults = true  // show live partial text
    recognition.maxAlternatives = 1
    // Don't force en-US — let device use its own language/locale preference
    // recognition.lang = 'en-US'

    onStatusChange?.('listening')

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          const finalText = text.trim()
          if (finalText) {
            onSegment({ text: finalText, timestamp: new Date().toISOString() })
          }
          interim = ''
        } else {
          interim += text
        }
      }
      interimRef.current = interim
      onInterim?.(interim) // pass live partial text to UI
    }

    recognition.onerror = (event) => {
      // 'no-speech', 'network', 'audio-capture' errors are common on mobile — just restart silently
      const ignoredErrors = ['aborted', 'no-speech', 'network', 'audio-capture']
      if (!ignoredErrors.includes(event.error)) {
        console.warn('[SpeechRecognition] Error:', event.error)
      }
      if (event.error === 'not-allowed') {
        onError?.('Microphone access denied. Please allow microphone permissions in your browser settings.')
        isRecordingRef.current = false
        onStatusChange?.(null)
      }
    }

    recognition.onstart = () => {
      onStatusChange?.('listening')
    }

    recognition.onend = () => {
      onInterim?.('') // clear interim on end
      if (isRecordingRef.current) {
        onStatusChange?.('restarting')
        // Restart quickly — 200ms is enough to avoid browser anti-spam throttle
        restartTimeoutRef.current = setTimeout(() => {
          if (isRecordingRef.current) {
            onStatusChange?.('listening')
            startRecognition()
          }
        }, 200)
      } else {
        onStatusChange?.(null)
      }
    }

    try {
      recognition.start()
    } catch (err) {
      console.warn('[SpeechRecognition] Start failed:', err.message)
      restartTimeoutRef.current = setTimeout(startRecognition, 500)
    }
  }, [onSegment, onInterim, onError, onStatusChange])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      onError?.('Live transcription is not supported in this browser. Please use Chrome on Android.')
      return
    }

    if (isRecording) {
      startRecognition()
    } else {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      onInterim?.('')
      onStatusChange?.(null)
      if (recognitionRef.current) {
        recognitionRef.current.onend = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onresult = null
        try { recognitionRef.current.stop() } catch (_) {}
        recognitionRef.current = null
      }
    }

    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) {
        recognitionRef.current.onend = null
        recognitionRef.current.onerror = null
        recognitionRef.current.onresult = null
        try { recognitionRef.current.stop() } catch (_) {}
        recognitionRef.current = null
      }
    }
  }, [isRecording])
}
