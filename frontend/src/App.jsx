import React, { useState, useEffect, useCallback, useRef } from 'react'
import './index.css'
import ThreatMeter from './components/ThreatMeter'
import AlertBanner from './components/AlertBanner'
import TranscriptPanel from './components/TranscriptPanel'
import AnalysisSummary from './components/AnalysisSummary'
import AudioUpload from './components/AudioUpload'
import useSpeechRecognition from './hooks/useSpeechRecognition'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const ANALYSIS_INTERVAL_MS = 20000 // analyze every 20s

export default function App() {
  const [activeTab, setActiveTab] = useState('live')

  // ── Live monitoring state ─────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false)
  const [segments, setSegments] = useState([])
  const [threatData, setThreatData] = useState({ score: 0, category: 'Safe', flaggedPhrases: [], reasoning: '' })
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [micError, setMicError] = useState(null)
  const [backendError, setBackendError] = useState(null)
  const [liveStatus, setLiveStatus] = useState(null)
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
  isRecordingRef.current = isRecording

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
  const addSegment = useCallback((seg) => {
    // seg can be { text, timestamp } object (from hook) or plain string (legacy)
    const text = typeof seg === 'string' ? seg : seg?.text
    const clean = (text || '').trim()
    if (!clean) return
    setSegments(prev => {
      const recent = prev.slice(-2).map(s => s.text.trim().toLowerCase())
      if (recent.includes(clean.toLowerCase())) return prev
      return [...prev, { text: clean, timestamp: seg?.timestamp || new Date().toISOString() }]
    })
    setSegmentCount(c => c + 1)
    fullTranscriptRef.current += ' ' + clean
    if (!firstSegmentRef.current) {
      firstSegmentRef.current = true
      setTimeout(runAnalysis, 500)
    }
  }, [runAnalysis])

  // ─── Speech Recognition (mobile-safe hook) ───────────────────────────────
  useSpeechRecognition({
    isRecording,
    onSegment: addSegment,
    onInterim: setInterimText,
    onError: (msg) => setMicError(msg),
    onStatusChange: (status) => {
      if (!status) setLiveStatus(null)
      else if (status === 'listening') setLiveStatus('Listening…')
      else if (status === 'restarting') setLiveStatus('Restarting…')
      else setLiveStatus(status)
    },
  })

  // ─── Wake Lock (prevent screen sleep during monitoring) ──────────────────
  const acquireWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch (_) { /* not fatal */ }
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release() } catch (_) {}
      wakeLockRef.current = null
    }
  }, [])

  // Re-acquire wake lock if page becomes visible again (tab switch, screen on)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRecordingRef.current) {
        acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [acquireWakeLock])

  // ─── Start / Stop handlers ────────────────────────────────────────────────
  const handleStart = async () => {
    setMicError(null)
    setBackendError(null)
    firstSegmentRef.current = false
    setLiveStatus('Connecting…')

    // Acquire Screen Wake Lock to prevent mobile OS hibernation
    await acquireWakeLock()

    // Warm up backend (prevents cold-start delay on first analysis)
    try { await fetch(`${BACKEND_URL}/health`) } catch (_) {}

    // Check Speech Recognition support before doing anything else
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setMicError('Live transcription is not supported in this browser. Please use Chrome on Android or Safari on iOS.')
      setLiveStatus(null)
      releaseWakeLock()
      return
    }

    // Just flip the recording state — the useSpeechRecognition hook takes
    // over from here. No getUserMedia pre-flight needed; the hook lets the
    // browser's SR engine negotiate mic access directly, avoiding the
    // Android mic-lock race condition.
    setIsRecording(true)
  }

  const handleStop = () => {
    setIsRecording(false)
    setLiveStatus(null)
    setInterimText('')
    releaseWakeLock()
    // Give hook 800ms to deliver any pending final results before running final analysis
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
      clearInterval(analysisRef.current)
      releaseWakeLock()
    }
  }, [releaseWakeLock])

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
                        liveStatus === 'Restarting…' ? 'var(--suspicious-color)' : 'var(--text-muted)',
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
        <div className="connection-toast toast-disconnected">
          ⚠️ Backend offline — on mobile, use your laptop's LAN IP (not localhost)
        </div>
      )}
      {backendOnline === true && !isRecording && segments.length === 0 && activeTab === 'live' && (
        <div className="connection-toast toast-connected">✓ Backend connected — ready to monitor</div>
      )}
    </div>
  )
}
