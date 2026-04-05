import { useEffect, useRef, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const CHUNK_INTERVAL_MS = 8000  // 8-second chunks — more audio = better transcription quality
const MIN_CHUNK_SIZE = 500      // lower threshold so iOS smaller chunks still get sent

// Detect iOS/Safari
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

// Get the best supported MIME type for this device
function getBestMimeType() {
  // Android Chrome prefers webm/opus. iOS Safari prefers mp4.
  // We try webm first (covers most Android/desktop), then mp4 (covers iOS)
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch (_) {}
  }
  return '' // let browser pick default
}

// Send chunk with 1 retry (handles Render cold-start timeout)
async function sendWithRetry(url, formData, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 25000) // 25s timeout
      const res = await fetch(url, { method: 'POST', body: formData, signal: controller.signal })
      clearTimeout(timeout)
      return res
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[AudioCapture] Attempt ${attempt + 1} failed, retrying in 4s…`, err.message)
        await new Promise(r => setTimeout(r, 4000))
      } else {
        throw err
      }
    }
  }
}

export default function useAudioCapture({ isRecording, onChunkReady, onError, onStatus }) {
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const mimeTypeRef = useRef('')
  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

  const sendChunk = useCallback(async (blob, mimeType) => {
    if (!blob || blob.size < MIN_CHUNK_SIZE) {
      console.log(`[AudioCapture] Skipping small chunk: ${blob?.size} bytes`)
      return
    }

    // Derive extension from mimeType
    let ext = 'webm'
    if (mimeType.includes('mp4')) ext = 'mp4'
    else if (mimeType.includes('ogg')) ext = 'ogg'
    else if (mimeType.includes('aac')) ext = 'aac'

    const fileName = `chunk.${ext}`
    const typedBlob = new Blob([blob], { type: mimeType || 'audio/mp4' })

    console.log(`[AudioCapture] Sending chunk: ${typedBlob.size} bytes, type=${mimeType}, file=${fileName}`)

    const formData = new FormData()
    formData.append('audio', typedBlob, fileName)

    try {
      onStatus?.('Transcribing…')
      const res = await sendWithRetry(`${BACKEND_URL}/transcribe`, formData, 1)
      const data = await res.json()

      if (!res.ok) {
        console.warn('[AudioCapture] Server error:', data)
        onError?.(data.error || 'Server rejected the audio chunk.')
        onStatus?.(null)
        return
      }

      onStatus?.(null)
      if (data.transcript && data.transcript.trim()) {
        console.log('[AudioCapture] Got transcript:', data.transcript)
        onChunkReady({ text: data.transcript.trim(), timestamp: new Date().toISOString() })
      } else {
        console.log('[AudioCapture] Empty transcript returned')
      }
    } catch (err) {
      console.error('[AudioCapture] Fetch failed:', err)
      onStatus?.(null)
      if (err.name === 'AbortError') {
        onError?.('Transcription timed out — backend may be waking up. Will retry next chunk.')
      } else {
        onError?.('Lost connection to backend. Will retry next chunk…')
      }
    }
  }, [onChunkReady, onError, onStatus])

  useEffect(() => {
    if (isRecording) {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then((stream) => {
          streamRef.current = stream

          const mimeType = getBestMimeType()
          mimeTypeRef.current = mimeType
          console.log(`[AudioCapture] Using MIME type: "${mimeType || 'browser default'}" | iOS: ${isIOS()}`)

          const recordNextChunk = () => {
            if (!isRecordingRef.current) return

            const options = mimeType ? { mimeType } : {}
            let recorder
            try {
              recorder = new MediaRecorder(stream, options)
            } catch (err) {
              console.warn('[AudioCapture] MediaRecorder failed with options, trying without:', err)
              recorder = new MediaRecorder(stream)
              mimeTypeRef.current = recorder.mimeType || 'audio/mp4'
            }
            mediaRecorderRef.current = recorder

            recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                sendChunk(e.data, mimeTypeRef.current)
              }
            }

            recorder.onstop = () => {
              if (isRecordingRef.current) {
                recordNextChunk()
              }
            }

            recorder.onerror = (e) => {
              console.error('[AudioCapture] MediaRecorder error:', e.error)
              onError?.('Recording error: ' + (e.error?.message || 'unknown'))
            }

            recorder.start()

            setTimeout(() => {
              if (isRecordingRef.current && recorder.state !== 'inactive') {
                recorder.stop()
              }
            }, CHUNK_INTERVAL_MS)
          }

          recordNextChunk()
        })
        .catch((err) => {
          console.error('[AudioCapture] Mic error:', err)
          onError?.('Microphone access denied. Please allow microphone permissions and reload.')
        })
    } else {
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
