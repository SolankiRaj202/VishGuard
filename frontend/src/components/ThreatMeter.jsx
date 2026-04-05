import React from 'react'
import ThreatBadge from './ThreatBadge'

export default function ThreatMeter({ score, category }) {
  const getBarColor = () => {
    if (score >= 70) return 'var(--danger-color)'
    if (score >= 30) return 'var(--suspicious-color)'
    return 'var(--safe-color)'
  }

  const getScoreColor = () => {
    if (score >= 70) return 'var(--danger-color)'
    if (score >= 30) return 'var(--suspicious-color)'
    return 'var(--safe-color)'
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
