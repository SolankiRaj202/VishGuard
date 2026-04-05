import { useEffect, useRef, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const CHUNK_INTERVAL_MS = 5000 // 5-second chunks for rapid real-time feedback
const MIN_CHUNK_SIZE = 1000   // skip near-silent / empty blobs smaller than 1 KB

export default function useAudioCapture({ isRecording, onChunkReady, onError }) {
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const mimeTypeRef = useRef('audio/webm') // track actual format chosen at start
  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

  const sendChunk = useCallback(async (blob, mimeType) => {
    if (!blob || blob.size < MIN_CHUNK_SIZE) return // skip empty / near-silent chunks

    // Use correct extension so Multer sets the right mimetype on disk
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'
    const fileName = `chunk.${ext}`

    // Re-wrap blob with explicit type so Multer always gets the correct MIME
    const typedBlob = new Blob([blob], { type: mimeType })

    const formData = new FormData()
    formData.append('audio', typedBlob, fileName)

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

      if (data.transcript && data.transcript.trim()) {
        onChunkReady({ text: data.transcript.trim(), timestamp: new Date().toISOString() })
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

          // Choose the best supported format once, reuse for all chunks
          let mimeType = ''
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus'
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm'
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4'
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg'
          }
          mimeTypeRef.current = mimeType || 'audio/webm'

          const recordNextChunk = () => {
            if (!isRecordingRef.current) return

            const options = mimeType ? { mimeType } : {}
            const recorder = new MediaRecorder(stream, options)
            mediaRecorderRef.current = recorder

            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                sendChunk(e.data, mimeTypeRef.current)
              }
            }

            // Start next chunk only AFTER this one fully stops
            recorder.onstop = () => {
              if (isRecordingRef.current) {
                recordNextChunk()
              }
            }

            recorder.start()

            setTimeout(() => {
              if (isRecordingRef.current && recorder.state !== 'inactive') {
                recorder.stop() // triggers ondataavailable → onstop
              }
            }, CHUNK_INTERVAL_MS)
          }

          recordNextChunk()
        })
        .catch((err) => {
          console.error('Mic error:', err)
          onError?.('Microphone access denied. Please allow microphone permissions and reload.')
        })
    } else {
      // Force stop all tracks
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }

    return () => {
      isRecordingRef.current = false
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop() } catch (_) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [isRecording, sendChunk, onError])
}
