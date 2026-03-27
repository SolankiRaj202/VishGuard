import React from 'react'

export default function AlertBanner({ score, category, onDismiss }) {
  if (score < 70) return null

  return (
    <div className="alert-banner">
      <span className="alert-icon">🚨</span>
      <div className="alert-text">
        <div className="alert-title">High Risk Detected — {category}</div>
        <div className="alert-desc">
          Threat score has reached {score}%. This call shows signs of fraud or phishing.
          Do not share personal information.
        </div>
      </div>
      <button className="alert-dismiss" onClick={onDismiss} title="Dismiss">✕</button>
    </div>
  )
}
