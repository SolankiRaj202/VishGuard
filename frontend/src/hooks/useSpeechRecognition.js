/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef } from 'react'

export default function useSpeechRecognition({ isRecording, onSegment, onError }) {
  const recognitionRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      onError?.('Speech Recognition is not supported. Please use Google Chrome or Microsoft Edge.')
      return
    }

    // Wrap initialization in a function so we can create fresh instances repeatedly
    const startRecognition = () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
        restartTimeoutRef.current = null
      }

      if (!isRecordingRef.current) return // abort if stopped

      // Create a new instance every time to bypass Chrome's harsh strict ~60s timeouts and "network" limits
      const recognition = new SpeechRecognition()
      recognitionRef.current = recognition

      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const text = event.results[i][0].transcript.trim()
            if (text) {
              onSegment({ text, timestamp: new Date().toISOString() })
            }
          }
        }
      }

      recognition.onerror = (event) => {
        // 'no-speech' and 'network' trigger frequently when it's just quiet. 
        // We ignore them here, let onend fire, and naturally restart it silently.
        if (event.error !== 'aborted' && event.error !== 'no-speech' && event.error !== 'network') {
          console.warn('Speech recognition error:', event.error)
          if (event.error === 'not-allowed' || event.error === 'not-allowed-browser') {
            onError?.('Microphone access denied. Please allow microphone permissions in your browser.')
            // Turn off recording state if permissions failed entirely
            isRecordingRef.current = false
          }
        }
      }

      // 💥 CRITICAL FIX: The robust infinite restart mechanism
      recognition.onend = () => {
        if (isRecordingRef.current) {
          // Wait briefly, then completely rebuild the recognition object from scratch
          restartTimeoutRef.current = setTimeout(() => {
            if (isRecordingRef.current) {
              startRecognition()
            }
          }, 350)
        }
      }

      try {
        recognition.start()
      } catch (err) {
        console.warn('Could not start speech recognition:', err.message)
        // If it fails to start synchronously (rare on fresh instances), queue a retry
        restartTimeoutRef.current = setTimeout(startRecognition, 1000)
      }
    }

    if (isRecording) {
      startRecognition()
    } else {
      // User clicked stop — tear everything down
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) {
        recognitionRef.current.onend = null
        recognitionRef.current.onerror = null
        try { recognitionRef.current.stop() } catch (_) { }
        recognitionRef.current = null
      }
    }

    // Cleanup on unmount or deps change
    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) {
        recognitionRef.current.onend = null
        recognitionRef.current.onerror = null
        try { recognitionRef.current.stop() } catch (_) { }
        recognitionRef.current = null
      }
    }
  }, [isRecording]) // Intentional: only trigger effect strictly when the recording boolean flips
}
