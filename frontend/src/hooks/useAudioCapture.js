import { useEffect, useRef, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const CHUNK_INTERVAL_MS = 5000 // 5-second chunks for rapid real-time feedback

export default function useAudioCapture({ isRecording, onChunkReady, onError }) {
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

  const sendChunk = useCallback(async (blob) => {
    if (!blob) return // skip empty chunks

    const formData = new FormData()
    // By providing a generic filename extension, the backend Multer + Gemini will sniff the mime type from the blob
    formData.append('audio', blob, 'chunk.m4a') 

    try {
      const res = await fetch(`${BACKEND_URL}/transcribe`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      
      if (!res.ok) {
        onError?.(data.error || 'Server rejected the audio chunk.')
        return
      }

      if (data.transcript) {
        onChunkReady({ text: data.transcript, timestamp: new Date().toISOString() })
      }
    } catch (err) {
      console.error('Transcription fetch failed:', err)
      onError?.('Lost connection to backend server. Reconnecting...')
    }
  }, [onChunkReady, onError])

  useEffect(() => {
    if (isRecording) {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then((stream) => {
          streamRef.current = stream

          const recordNextChunk = () => {
            if (!isRecordingRef.current) return

            // Let the browser choose its most reliable native format (solves iOS errors!)
            let options = {}
            if (MediaRecorder.isTypeSupported('audio/webm')) {
              options = { mimeType: 'audio/webm' }
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
              options = { mimeType: 'audio/mp4' } 
            }

            const recorder = new MediaRecorder(stream, options)
            mediaRecorderRef.current = recorder

            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                // Send the perfectly self-contained file (with headers) to backend
                sendChunk(e.data)
              }
            }

            recorder.start()

            // After 20s, stop this chunk (which triggers ondataavailable) and instantly start the next
            setTimeout(() => {
              if (isRecordingRef.current && recorder.state !== 'inactive') {
                recorder.stop()
                recordNextChunk()
              }
            }, CHUNK_INTERVAL_MS)
          }

          recordNextChunk()
        })
        .catch((err) => {
          console.error('Mic error:', err)
          onError?.('Microphone access denied. Please check site permissions or try a different browser.')
        })
    } else {
      // Force stop
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }

    return () => {
      isRecordingRef.current = false // Prevents loops if unmounted
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch (_) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [isRecording, sendChunk, onError])
}
