import React, { useState, useEffect, useCallback, useRef } from 'react'
import './index.css'
import ThreatMeter from './components/ThreatMeter'
import AlertBanner from './components/AlertBanner'
import TranscriptPanel from './components/TranscriptPanel'
import AnalysisSummary from './components/AnalysisSummary'
import AudioUpload from './components/AudioUpload'
import useAudioCapture from './hooks/useAudioCapture'

// In production this is set via VITE_BACKEND_URL env variable (see .env.production / GitHub Actions secret)
// In local development it falls back to localhost:4000
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const ANALYSIS_INTERVAL_MS = 30000 // re-analyze every 30 seconds

export default function App() {
  const [activeTab, setActiveTab] = useState('live') // 'live' | 'upload'

  // ── Live monitoring state ──────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false)
  const [segments, setSegments] = useState([])
  const [threatData, setThreatData] = useState({ score: 0, category: 'Safe', flaggedPhrases: [], reasoning: '' })
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [micError, setMicError] = useState(null)
  const [segmentCount, setSegmentCount] = useState(0)
  const [duration, setDuration] = useState(0)
  const durationRef = useRef(null)
  const analysisRef = useRef(null)
  const fullTranscriptRef = useRef('')

  // ── Upload state ───────────────────────────────────────────────────────────
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadFileName, setUploadFileName] = useState('')

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [backendOnline, setBackendOnline] = useState(null)

  // ─── Check backend health on mount ─────────────────────────────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((r) => r.json())
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false))
  }, [])

  // ─── Duration timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      durationRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } else {
      clearInterval(durationRef.current)
    }
    return () => clearInterval(durationRef.current)
  }, [isRecording])

  // ─── AI analysis loop ────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    const transcript = fullTranscriptRef.current
    if (!transcript || transcript.trim().length < 10) return
    try {
      const res = await fetch(`${BACKEND_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      const data = await res.json()
      setThreatData(data)
      if (data.score >= 70) setAlertDismissed(false)
    } catch (err) {
      console.error('Analysis failed:', err)
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

  // ─── Handle new transcript segment ─────────────────────────────────────────
  const handleChunkReady = useCallback((segment) => {
    setSegments((prev) => [...prev, segment])
    setSegmentCount((c) => c + 1)
    fullTranscriptRef.current += ' ' + segment.text
  }, [])

  // ─── Audio capture (Real media streaming recording for robust mobile support) 
  useAudioCapture({ isRecording, onChunkReady: handleChunkReady, onError: setMicError })

  // ─── Control handlers ────────────────────────────────────────────────────────
  const handleStart = () => { setMicError(null); setIsRecording(true) }
  const handleStop = () => { setIsRecording(false); setTimeout(runAnalysis, 1000) }
  const handleReset = () => {
    setIsRecording(false)
    setSegments([])
    setThreatData({ score: 0, category: 'Safe', flaggedPhrases: [], reasoning: '' })
    setAlertDismissed(false)
    setMicError(null)
    setDuration(0)
    setSegmentCount(0)
    fullTranscriptRef.current = ''
  }

  // ─── Upload result handler ──────────────────────────────────────────────────
  const handleUploadResult = (data, fileName) => {
    setUploadResult(data)
    setUploadFileName(fileName)
  }

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  // Determine which threat data to show in the right panel
  const displayThreat = activeTab === 'upload' && uploadResult ? uploadResult : threatData

  return (
    <div className="app">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
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

      {/* ─── Alert Banner ───────────────────────────────────────────────────── */}
      {!alertDismissed && (
        <AlertBanner score={displayThreat.score} category={displayThreat.category} onDismiss={() => setAlertDismissed(true)} />
      )}

      {/* ─── Mic error ──────────────────────────────────────────────────────── */}
      {micError && (
        <div className="alert-banner" style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)' }}>
          <span className="alert-icon">⚠️</span>
          <div className="alert-text">
            <div className="alert-title" style={{ color: 'var(--suspicious-color)' }}>Microphone Error</div>
            <div className="alert-desc" style={{ color: 'rgba(245,158,11,0.75)' }}>{micError}</div>
          </div>
          <button className="alert-dismiss" onClick={() => setMicError(null)}>✕</button>
        </div>
      )}

      {/* ─── Stats Row ──────────────────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{formatDuration(duration)}</div>
          <div className="stat-label">Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-cyan)' }}>{segmentCount}</div>
          <div className="stat-label">Segments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: backendOnline === null ? 'var(--text-muted)' : backendOnline ? 'var(--safe-color)' : 'var(--danger-color)' }}>
            {backendOnline === null ? '…' : backendOnline ? 'ON' : 'OFF'}
          </div>
          <div className="stat-label">Backend</div>
        </div>
      </div>

      {/* ─── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="tabs">
        <button
          id="tab-live"
          className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          🎙️ Live Monitoring
        </button>
        <button
          id="tab-upload"
          className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📁 Analyze Audio File
        </button>
      </div>

      {/* ─── Main Dashboard ─────────────────────────────────────────────────── */}
      <div className="dashboard-grid">
        {/* LEFT: Content switches by tab */}
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

                {/* Show transcript from upload result */}
                {uploadResult?.transcript && (
                  <div style={{ marginTop: '20px' }}>
                    <div className="card-title" style={{ marginBottom: '12px', fontSize: '0.78rem' }}>
                      <span>📝</span> TRANSCRIPT — {uploadFileName}
                    </div>
                    <div style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '16px',
                      fontSize: '0.88rem',
                      lineHeight: '1.7',
                      color: 'var(--text-primary)',
                      maxHeight: '320px',
                      overflowY: 'auto',
                    }}>
                      {uploadResult.transcript}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Threat panels (shared, shows whichever tab is active) */}
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

      {/* ─── Toasts ─────────────────────────────────────────────────────────── */}
      {backendOnline === false && (
        <div className="connection-toast toast-disconnected">⚠️ Backend offline — start the server on port 4000</div>
      )}
      {backendOnline === true && !isRecording && segments.length === 0 && activeTab === 'live' && (
        <div className="connection-toast toast-connected">✓ Backend connected — ready to monitor</div>
      )}
    </div>
  )
}
