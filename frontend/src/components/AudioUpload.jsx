import React, { useState, useRef } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const ACCEPTED_TYPES = '.mp3,.mp4,.wav,.webm,.ogg,.m4a,.flac,.aac'

export default function AudioUpload({ onResult }) {
  const [status, setStatus] = useState('idle') // idle | uploading | done | error
  const [progress, setProgress] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setStatus('uploading')
    setProgress('Sending audio to AI for analysis…')

    const formData = new FormData()
    formData.append('audio', file)

    try {
      const res = await fetch(`${BACKEND_URL}/analyze-audio`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Server error')
      }

      const data = await res.json()
      setStatus('done')
      setProgress('')
      onResult(data, file.name)
    } catch (err) {
      console.error(err)
      setStatus('error')
      setProgress(err.message || 'Upload failed. Check backend connection.')
    }

    // Reset file input so the same file can be re-uploaded
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="audio-upload-wrapper">
      <div
        className={`upload-dropzone ${status === 'uploading' ? 'uploading' : ''}`}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES}
          style={{ display: 'none' }}
          onChange={handleFile}
          id="audio-file-input"
        />

        {status === 'idle' && (
          <>
            <div className="upload-icon">🎵</div>
            <div className="upload-label">Click to upload an audio file</div>
            <div className="upload-sub">MP3, MP4, WAV, WebM, OGG, M4A, FLAC, AAC</div>
          </>
        )}

        {status === 'uploading' && (
          <>
            <div className="upload-icon spinner">⏳</div>
            <div className="upload-label">{fileName}</div>
            <div className="upload-sub upload-progress">{progress}</div>
          </>
        )}

        {status === 'done' && (
          <>
            <div className="upload-icon">✅</div>
            <div className="upload-label">Analysis complete</div>
            <div className="upload-sub">Click to analyze another file</div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="upload-icon">❌</div>
            <div className="upload-label">Analysis failed</div>
            <div className="upload-sub upload-error">{progress}</div>
          </>
        )}
      </div>
    </div>
  )
}
