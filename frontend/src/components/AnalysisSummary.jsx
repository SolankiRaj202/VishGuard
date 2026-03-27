import React from 'react'

export default function AnalysisSummary({ reasoning, flaggedPhrases, score }) {
  return (
    <div className="card-body">
      {reasoning ? (
        <p className="analysis-reasoning">"{reasoning}"</p>
      ) : (
        <p className="analysis-reasoning" style={{ color: 'var(--text-muted)', fontStyle: 'normal' }}>
          AI analysis will appear here as the conversation progresses…
        </p>
      )}

      <div className="flagged-list">
        {flaggedPhrases && flaggedPhrases.length > 0 ? (
          flaggedPhrases.map((phrase, i) => (
            <div key={i} className="flagged-item">
              <span className="flagged-icon">⚑</span>
              <span>"{phrase}"</span>
            </div>
          ))
        ) : (
          <div className="no-flags">
            <span>✓</span>
            <span>No suspicious phrases flagged yet</span>
          </div>
        )}
      </div>
    </div>
  )
}
