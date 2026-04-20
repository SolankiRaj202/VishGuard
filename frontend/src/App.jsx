import React, { useState, useEffect, useCallback, useRef } from 'react'
import './index.css'
import ThreatMeter from './components/ThreatMeter'
import AlertBanner from './components/AlertBanner'
import TranscriptPanel from './components/TranscriptPanel'
import AnalysisSummary from './components/AnalysisSummary'
import AudioUpload from './components/AudioUpload'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const ANALYSIS_INTERVAL_MS = 20000  // analyze every 20s
const CHUNK_INTERVAL_MS = 15000     // send audio every 15s to give LLM enough context

// Pick best MIME for current device
function getBestMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  for (const t of types) {
    try { if (MediaRecorder.isTypeSupported(t)) return t } catch (_) {}
  }
  return ''
}

export default function App() {
  const [activeTab, setActiveTab] = useState('live')

  // ── Live monitoring state ─────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false)
  const [segments, setSegments] = useState([])
  const [threatData, setThreatData] = useState({ score: 0, category: 'Safe', flaggedPhrases: [], reasoning: '' })
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [micError, setMicError] = useState(null)
  const [backendError, setBackendError] = useState(null)
  const [liveStatus, setLiveStatus] = useState(null)   // e.g. 'Listening…', 'Transcribing…'
  const [interimText, setInterimText] = useState('')
  const [segmentCount, setSegmentCount] = useState(0)
  const [duration, setDuration] = useState(0)

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadFileName, setUploadFileName] = useState('')

  // ── Shared ────────────────────────────────────────────────────────────────
  const [backendOnline, setBackendOnline] = useState(null)

  // Internal refs
  const fullTranscriptRef = useRef('')
  const firstSegmentRef = useRef(false)
  const durationRef = useRef(null)
  const analysisRef = useRef(null)
  const isRecordingRef = useRef(false)
  const wakeLockRef = useRef(null)
  const srFlushIntervalRef = useRef(null)
  isRecordingRef.current = isRecording

  // Recorder refs
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const recognitionRef = useRef(null)
  const srRestartRef = useRef(null)

  // ─── Check backend health ────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then(r => r.json())
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false))
  }, [])

  // ─── Duration timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      durationRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } else {
      clearInterval(durationRef.current)
    }
    return () => clearInterval(durationRef.current)
  }, [isRecording])

  // ─── Analysis loop ────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    const t = fullTranscriptRef.current.trim()
    if (t.length < 5) return
    try {
      const res = await fetch(`${BACKEND_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: t }),
      })
      const data = await res.json()
      setThreatData(data)
      if (data.score >= 70) setAlertDismissed(false)
    } catch (err) {
      console.warn('[App] Analysis error:', err.message)
    }
  }, [])

  useEffect(() => {
    if (isRecording) {
      analysisRef.current = setInterval(runAnalysis, ANALYSIS_INTERVAL_MS)
    } else {
      clearInterval(analysisRef.current)
    }
    return () => clearInterval(analysisRef.current)
  }, [isRecording, runAnalysis])

  // ─── Add segment (deduped) ────────────────────────────────────────────────
  const addSegment = useCallback((text) => {
    const clean = text.trim()
    if (!clean) return
    setSegments(prev => {
      const recent = prev.slice(-2).map(s => s.text.trim().toLowerCase())
      if (recent.includes(clean.toLowerCase())) return prev
      return [...prev, { text: clean, timestamp: new Date().toISOString() }]
    })
    setSegmentCount(c => c + 1)
    fullTranscriptRef.current += ' ' + clean
    if (!firstSegmentRef.current) {
      firstSegmentRef.current = true
      setTimeout(runAnalysis, 500)
    }
  }, [runAnalysis])

  // ─── Method 1: Browser Speech Recognition ────────────────────────────────
  const startSpeechRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    if (srRestartRef.current) clearTimeout(srRestartRef.current)
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      try { recognitionRef.current.stop() } catch (_) {}
    }

    const r = new SR()
    recognitionRef.current = r
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1

    r.onstart = () => {
      setLiveStatus('Listening…')
      if (srFlushIntervalRef.current) clearInterval(srFlushIntervalRef.current)
      srFlushIntervalRef.current = setInterval(() => {
        try { recognitionRef.current?.stop() } catch (_) {}
      }, 15000)
    }

    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          addSegment(e.results[i][0].transcript)
          interim = ''
        } else {
          interim += e.results[i][0].transcript
        }
      }
      setInterimText(interim)
    }

    r.onerror = (e) => {
      if (e.error === 'not-allowed') {
        setMicError('Microphone access denied. Allow permissions and reload.')
      }
      // no-speech / network / audio-capture — just restart silently
    }

    r.onend = () => {
      if (srFlushIntervalRef.current) clearInterval(srFlushIntervalRef.current)
      setInterimText('')
      if (isRecordingRef.current) {
        srRestartRef.current = setTimeout(startSpeechRecognition, 300)
      } else {
        setLiveStatus(null)
      }
    }

    try { r.start() } catch (_) {
      srRestartRef.current = setTimeout(startSpeechRecognition, 500)
    }
  }, [addSegment])

  const stopSpeechRecognition = useCallback(() => {
    if (srRestartRef.current) clearTimeout(srRestartRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (_) {} // Allows final onresult to flush organically
    }
  }, [])

  // ─── Method 2: Backend audio chunk transcription ──────────────────────────
  const sendAudioChunk = useCallback(async (blob, mimeType) => {
    if (!blob || blob.size < 300) return
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm'
    const fd = new FormData()
    fd.append('audio', new Blob([blob], { type: mimeType }), `chunk.${ext}`)
    setLiveStatus('Transcribing…')
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 20000)
      const res = await fetch(`${BACKEND_URL}/transcribe`, { method: 'POST', body: fd, signal: controller.signal })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json()
        if (data.transcript?.trim()) addSegment(data.transcript)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setBackendError('Backend transcription timed out. Browser recognition still active.')
        setTimeout(() => setBackendError(null), 8000)
      }
    } finally {
      if (isRecordingRef.current) setLiveStatus('Listening…')
      else setLiveStatus(null)
    }
  }, [addSegment])

  const startAudioCapture = useCallback(() => {
    const mimeType = getBestMimeType()

    const recordChunk = () => {
      if (!isRecordingRef.current || !streamRef.current) return
      let rec
      try {
        rec = mimeType
          ? new MediaRecorder(streamRef.current, { mimeType })
          : new MediaRecorder(streamRef.current)
      } catch (_) {
        rec = new MediaRecorder(streamRef.current)
      }
      mediaRecorderRef.current = rec
      rec.ondataavailable = (e) => { if (e.data?.size > 0) sendAudioChunk(e.data, rec.mimeType || mimeType || 'audio/webm') }
      rec.onstop = () => { if (isRecordingRef.current) recordChunk() }
      rec.start()
      setTimeout(() => {
        if (isRecordingRef.current && rec.state !== 'inactive') rec.stop()
      }, CHUNK_INTERVAL_MS)
    }
    recordChunk()
  }, [sendAudioChunk])

  const stopAudioCapture = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch (_) {} // triggers final ondataavailable
    }
    // Give browser 1000ms to flush the blob before severing the track
    setTimeout(() => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }, 1000)
  }, [])

  // ─── Start / Stop handlers ────────────────────────────────────────────────
  const handleStart = async () => {
    setMicError(null)
    firstSegmentRef.current = false
    setLiveStatus('Connecting…')

    // Acquire Screen Wake Lock to prevent mobile OS hibernation
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch (_) {}

    // Wake Render backend
    try { await fetch(`${BACKEND_URL}/health`) } catch (_) {}

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition

    try {
      if (SR) {
        // Request microphone permission to ensure it's granted
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        // Immediately release the microphone because Android allows only one audio capture session,
        // and Speech Recognition needs exclusive control.
        tempStream.getTracks().forEach(t => t.stop())
        await new Promise(resolve => setTimeout(resolve, 300)) // Give Android OS time to free the mic lock
        
        isRecordingRef.current = true // forcefully update ref before start
        setIsRecording(true)
        setLiveStatus('Listening…')
        startSpeechRecognition()
      } else {
        // Fallback for browsers without SpeechRecognition
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        streamRef.current = stream
        isRecordingRef.current = true // forcefully update ref before start
        setIsRecording(true)
        setLiveStatus('Listening…')
        startAudioCapture()
      }
    } catch (err) {
      setMicError('Microphone access denied. Please allow microphone permissions and reload.')
      setLiveStatus(null)
    }
  }

  const handleStop = () => {
    isRecordingRef.current = false // forcefully update ref to stop restart loops
    setIsRecording(false)
    setLiveStatus(null)
    stopSpeechRecognition()
    stopAudioCapture()
    if (srFlushIntervalRef.current) clearInterval(srFlushIntervalRef.current)
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release() } catch (_) {}
      wakeLockRef.current = null
    }
    setTimeout(runAnalysis, 800)
  }

  const handleReset = () => {
    handleStop()
    setSegments([])
    setThreatData({ score: 0, category: 'Safe', flaggedPhrases: [], reasoning: '' })
    setAlertDismissed(false)
    setMicError(null)
    setBackendError(null)
    setInterimText('')
    setLiveStatus(null)
    setDuration(0)
    setSegmentCount(0)
    fullTranscriptRef.current = ''
    firstSegmentRef.current = false
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeechRecognition()
      stopAudioCapture()
      if (srFlushIntervalRef.current) clearInterval(srFlushIntervalRef.current)
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release() } catch (_) {}
      }
    }
  }, [stopSpeechRecognition, stopAudioCapture])

  const handleUploadResult = (data, fileName) => {
    setUploadResult(data)
    setUploadFileName(fileName)
  }

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const displayThreat = activeTab === 'upload' && uploadResult ? uploadResult : threatData

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <div className="header-icon">🛡️</div>
          <div>
            <h1>VishGuard</h1>
            <div className="header-subtitle">Real-Time Call Spam &amp; Phishing Detector</div>
          </div>
        </div>
        <div className="header-status">
          <div className={`status-dot ${isRecording ? 'active' : ''}`} />
          {isRecording ? 'Monitoring Active' : 'Standby'}
        </div>
      </header>

      {/* Alert Banner */}
      {!alertDismissed && (
        <AlertBanner score={displayThreat.score} category={displayThreat.category} onDismiss={() => setAlertDismissed(true)} />
      )}

      {/* Mic error */}
      {micError && (
        <div className="alert-banner" style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)' }}>
          <span className="alert-icon">⚠️</span>
          <div className="alert-text">
            <div className="alert-title" style={{ color: 'var(--suspicious-color)' }}>Microphone Error</div>
            <div className="alert-desc">{micError}</div>
          </div>
          <button className="alert-dismiss" onClick={() => setMicError(null)}>✕</button>
        </div>
      )}

      {/* Backend error */}
      {backendError && isRecording && (
        <div className="alert-banner" style={{ borderColor: 'rgba(156,163,175,0.35)', background: 'rgba(156,163,175,0.06)' }}>
          <span className="alert-icon">ℹ️</span>
          <div className="alert-text">
            <div className="alert-title">Transcription Note</div>
            <div className="alert-desc">{backendError}</div>
          </div>
          <button className="alert-dismiss" onClick={() => setBackendError(null)}>✕</button>
        </div>
      )}

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{formatDuration(duration)}</div>
          <div className="stat-label">Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{segmentCount}</div>
          <div className="stat-label">Segments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: backendOnline === null ? 'var(--text-muted)' : backendOnline ? 'var(--safe-color)' : 'var(--danger-color)' }}>
            {backendOnline === null ? '…' : backendOnline ? 'ON' : 'OFF'}
          </div>
          <div className="stat-label">Backend</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button id="tab-live" className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
          🎙️ Live Monitoring
        </button>
        <button id="tab-upload" className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
          📁 Analyze Audio File
        </button>
      </div>

      {/* Dashboard */}
      <div className="dashboard-grid">
        <div className="dashboard-left">

          {/* LIVE TAB */}
          {activeTab === 'live' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon">🎙️</span>
                  Live Transcript
                </div>
                <div className="control-panel">
                  {isRecording && (
                    <div className="recording-indicator">
                      <div className="recording-dot" />
                      REC {formatDuration(duration)}
                    </div>
                  )}
                  {!isRecording ? (
                    <button id="btn-start-monitoring" className="btn-start" onClick={handleStart}>▶ Start Monitoring</button>
                  ) : (
                    <button id="btn-stop-monitoring" className="btn-start btn-stop" onClick={handleStop}>■ Stop</button>
                  )}
                  <button id="btn-reset" className="btn-reset" onClick={handleReset}>↺ Reset</button>
                </div>
              </div>
              <div className="card-body">
                <TranscriptPanel segments={segments} flaggedPhrases={threatData.flaggedPhrases} />

                {/* Live interim text */}
                {isRecording && interimText && (
                  <div style={{ padding: '8px 14px', marginTop: '6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-secondary)', border: '1px dashed var(--border)',
                    fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {interimText}
                  </div>
                )}

                {/* Status indicator */}
                {isRecording && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px',
                    fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span style={{
                      display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                      background: liveStatus === 'Listening…' ? 'var(--safe-color)' :
                        liveStatus === 'Transcribing…' ? 'var(--suspicious-color)' : 'var(--text-muted)',
                    }} />
                    {liveStatus || 'Initializing…'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* UPLOAD TAB */}
          {activeTab === 'upload' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon">📁</span>
                  Analyze Uploaded Audio
                </div>
              </div>
              <div className="card-body">
                <AudioUpload onResult={handleUploadResult} />
                {uploadResult?.transcript && (
                  <div style={{ marginTop: '20px' }}>
                    <div className="card-title" style={{ marginBottom: '12px', fontSize: '0.78rem' }}>
                      <span>📝</span> TRANSCRIPT — {uploadFileName}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                      borderRadius: '10px', padding: '16px', fontSize: '0.88rem', lineHeight: '1.7',
                      color: 'var(--text-primary)', maxHeight: '320px', overflowY: 'auto' }}>
                      {uploadResult.transcript}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Threat panels */}
        <div className="dashboard-right">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="card-title-icon">⚡</span>
                Threat Analysis
              </div>
            </div>
            <ThreatMeter score={displayThreat.score} category={displayThreat.category} />
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <span className="card-title-icon">🤖</span>
                AI Assessment
              </div>
            </div>
            <AnalysisSummary
              reasoning={displayThreat.reasoning}
              flaggedPhrases={displayThreat.flaggedPhrases}
              score={displayThreat.score}
            />
          </div>
        </div>
      </div>

      {/* Toasts */}
      {backendOnline === false && (
        <div className="connection-toast toast-disconnected">⚠️ Backend offline — check server connection</div>
      )}
      {backendOnline === true && !isRecording && segments.length === 0 && activeTab === 'live' && (
        <div className="connection-toast toast-connected">✓ Backend connected — ready to monitor</div>
      )}
    </div>
  )
}
