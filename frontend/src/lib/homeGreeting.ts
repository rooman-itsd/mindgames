/**
 * The Home greeting's time-of-day hello. Pure: hour in, phrase out.
 */
export function timeGreeting(hour: number): string {
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
