import React from 'react'
import ThreatBadge from './ThreatBadge'

export default function ThreatMeter({ score, category }) {
  const getBarColor = () => {
    if (score >= 70) return 'linear-gradient(90deg, #f59e0b, #ef4444)'
    if (score >= 30) return 'linear-gradient(90deg, #06b6d4, #f59e0b)'
    return 'linear-gradient(90deg, #3b82f6, #10b981)'
  }

  const getScoreColor = () => {
    if (score >= 70) return '#ef4444'
    if (score >= 30) return '#f59e0b'
    return '#10b981'
  }

  return (
    <div className="threat-meter-wrapper">
      <div className="threat-score-row">
        <div>
          <div className="threat-score-label">THREAT SCORE</div>
          <div className="threat-score-value" style={{ color: getScoreColor() }}>
            {score}<span style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-muted)' }}>%</span>
          </div>
        </div>
        <ThreatBadge score={score} category={category} />
      </div>

      <div className="threat-bar-track">
        <div
          className="threat-bar-fill"
          style={{
            width: `${score}%`,
            background: getBarColor(),
          }}
        />
      </div>

      <div className="threat-bar-labels">
        <span>0 — Safe</span>
        <span>50 — Suspicious</span>
        <span>100 — High Risk</span>
      </div>
    </div>
  )
}
