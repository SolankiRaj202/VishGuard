import React from 'react'

export default function ThreatBadge({ category, score }) {
  const getBadgeClass = () => {
    if (score >= 70) return 'badge-danger'
    if (score >= 30) return 'badge-suspicious'
    return 'badge-safe'
  }

  const getEmoji = () => {
    if (score >= 70) return '🔴'
    if (score >= 30) return '🟡'
    return '🟢'
  }

  return (
    <span className={`threat-badge ${getBadgeClass()}`}>
      {getEmoji()} {category || 'Safe'}
    </span>
  )
}
