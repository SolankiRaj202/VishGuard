import { useEffect, useRef, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const CHUNK_INTERVAL_MS = 20000 // 20-second chunks

export default function useAudioCapture({ isRecording, onChunkReady, onError }) {
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const intervalRef = useRef(null)

  const sendChunk = useCallback(async () => {
    if (chunksRef.current.length === 0) return

    const blob = new Blob(chunksRef.current, { type: 'audio/webm; codecs=opus' })
    chunksRef.current = []

    if (blob.size < 1000) return // skip tiny/empty chunks

    const formData = new FormData()
    formData.append('audio', blob, 'chunk.webm')

    try {
      const res = await fetch(`${BACKEND_URL}/transcribe`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.transcript) {
        onChunkReady({ text: data.transcript, timestamp: new Date().toISOString() })
      }
    } catch (err) {
      console.error('Transcription fetch failed:', err)
    }
  }, [onChunkReady])

  useEffect(() => {
    if (isRecording) {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then((stream) => {
          streamRef.current = stream

          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
              ? 'audio/webm; codecs=opus'
              : 'audio/webm',
          })
          mediaRecorderRef.current = recorder

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunksRef.current.push(e.data)
            }
          }

          recorder.start(CHUNK_INTERVAL_MS)

          // Every chunk interval, batch-send
          intervalRef.current = setInterval(sendChunk, CHUNK_INTERVAL_MS + 200)
        })
        .catch((err) => {
          console.error('Mic error:', err)
          onError?.('Microphone access denied. Please allow microphone permissions.')
        })
    } else {
      // Stop recording
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      // Send final chunk
      sendChunk()
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRecording, sendChunk, onError])
}
