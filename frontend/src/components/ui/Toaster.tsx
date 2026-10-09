import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useApp } from '../../store/AppStore'

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const ACCENT = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-brand',
}

export function Toaster() {
  const { toasts, dismissToast } = useApp()
  return (
    // z-[110]: above the app's modals (z-[100]), so a toast raised while one
    // is open is never dimmed under its backdrop. (Two older note modals in
    // RightSidebar/NetworkMatches still sit higher, at z-[999]+.)
    <div className="fixed bottom-24 right-5 z-[110] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2 lg:bottom-5">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div
            key={t.id}
            role="status"
            className="animate-slidein relative flex items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface px-4 py-3 shadow-lg"
          >
            <Icon size={20} className={`mt-0.5 shrink-0 ${ACCENT[t.kind]}`} />
            <p className="flex-1 text-sm text-ink">{t.message}</p>
            {/* Optional action, e.g. Undo. Running it also closes the toast. */}
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick()
                  dismissToast(t.id)
                }}
                className="-my-1 rounded-md px-2 py-1 text-sm font-bold text-brand hover:bg-brand-50"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="text-muted hover:text-ink">
              <X size={16} />
            </button>
            {/* Countdown: shows how long the action stays available (6s, see notify). */}
            {t.action && <span aria-hidden className="toast-countdown absolute bottom-0 left-0 h-[3px] bg-marigold" />}
          </div>
        )
      })}
    </div>
  )
}
