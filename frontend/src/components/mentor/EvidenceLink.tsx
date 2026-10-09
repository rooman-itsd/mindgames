import type { ReactNode } from 'react'
import { api } from '../../lib/api'
import type { CareerResource } from '../../types'

/**
 * The link a mentee sent back, as the MENTOR opens it. Opening it is what ends
 * the mentee's chance to replace the work quietly, so it records "seen" for
 * the exact submission on screen — on a normal click and on a middle-click
 * (onAuxClick; a middle-click never fires onClick). The one place that owns
 * this, so the three mentor views can't drift apart.
 *
 * `track={false}` renders a plain link (e.g. the mentee viewing their own).
 */
export function EvidenceLink({
  resource,
  className,
  children,
  track = true,
}: {
  resource: CareerResource
  className?: string
  children: ReactNode
  track?: boolean
}) {
  const markSeen = () => {
    if (track && resource.submissionAt) void api.markEvidenceSeen(resource.id, resource.submissionAt).catch(() => {})
  }
  return (
    <a
      href={resource.submissionUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={markSeen}
      onAuxClick={(e) => e.button === 1 && markSeen()}
      className={className}
    >
      {children}
    </a>
  )
}
