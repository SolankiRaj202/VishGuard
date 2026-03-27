import React, { useRef, useEffect } from 'react'

function highlightFlagged(text, flaggedPhrases) {
  if (!flaggedPhrases || flaggedPhrases.length === 0) return text
  let result = text
  flaggedPhrases.forEach((phrase) => {
    if (!phrase) return
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'gi'), `<mark>${phrase}</mark>`)
  })
  return result
}

export default function TranscriptPanel({ segments, flaggedPhrases }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments])

  if (segments.length === 0) {
    return (
      <div className="transcript-panel">
        <div className="transcript-empty">
          <span className="transcript-empty-icon">🎙️</span>
          <p>Transcript will appear here once monitoring starts…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="transcript-panel">
      {segments.map((seg, i) => {
        const isFlagged = flaggedPhrases && flaggedPhrases.some(
          (p) => p && seg.text.toLowerCase().includes(p.toLowerCase())
        )
        const highlighted = highlightFlagged(seg.text, flaggedPhrases)
        const time = new Date(seg.timestamp).toLocaleTimeString()

        return (
          <div key={i} className={`transcript-segment ${isFlagged ? 'flagged' : ''}`}>
            <div className="transcript-time">{time}{isFlagged ? ' ⚠️' : ''}</div>
            <div
              className="transcript-text"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
