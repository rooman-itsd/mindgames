// The match percentage, drawn as a ring.
//
// A ring rather than a bar because these sit in a dense card grid where a
// horizontal bar would compete with the existing alumni row for width. The
// track is the same #edeff1 used for every border in the app, so an unfilled
// ring reads as part of the furniture rather than as an error state.
//
// Confidence is expressed as the ring's opacity, not as a different colour:
// a low-confidence score is the same measurement made on less evidence, and
// giving it a warning colour would overstate what it means.
const CONFIDENCE_OPACITY = {
  high: 1,
  medium: 0.75,
  low: 0.45,
} as const

export function MatchScoreRing({
  score,
  confidence,
  size = 46,
}: {
  score: number
  confidence: keyof typeof CONFIDENCE_OPACITY
  size?: number
}) {
  const stroke = size <= 46 ? 4 : 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  // Clamped so a future weighting change can never draw a ring past full.
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          opacity={CONFIDENCE_OPACITY[confidence]}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold text-ink"
        style={{ fontSize: size <= 46 ? 12 : 14 }}
      >
        {score}
      </span>
    </div>
  )
}
