import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, X } from 'lucide-react'
import { api } from '../../lib/api'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = ["Who's hiring right now?", 'Find me a mentor', 'Any events coming up?']

/** Floating Claude-powered assistant grounded in live network data. */
export function AskRoo() {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [turns, thinking])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || thinking) return
    setDraft('')
    const history = turns
    setTurns((t) => [...t, { role: 'user', content: q }])
    setThinking(true)
    try {
      const { answer } = await api.askRoo(q, history)
      setTurns((t) => [...t, { role: 'assistant', content: answer }])
    } catch (err) {
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          content:
            err instanceof Error && err.message ? err.message : 'Something went wrong — try again.',
        },
      ])
    } finally {
      setThinking(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-24 z-40 flex items-center gap-2 lg:bottom-5 rounded-full bg-gradient-to-r from-amethyst-600 to-iris-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-iris-600/30 transition-transform hover:scale-105"
        aria-label="Ask Roo"
      >
        <Sparkles size={17} /> Ask Roo
      </button>
    )
  }

  return (
    <div className="fixed right-5 bottom-24 z-40 flex h-[480px] lg:bottom-5 w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-amethyst-600 to-iris-600 px-4 py-3 text-white">
        <Sparkles size={17} />
        <div className="flex-1">
          <p className="text-sm font-bold leading-tight">Ask Roo</p>
          <p className="text-[11px] text-iris-100">Answers from your network's live data</p>
        </div>
        <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-white/15" aria-label="Close Ask Roo">
          <X size={17} />
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-page p-3">
        {turns.length === 0 && (
          <div className="pt-4 text-center">
            <p className="text-sm text-muted">
              Hi! I know the members, jobs, mentors, events and communities on Root Connect. Ask me
              anything about the network.
            </p>
            <div className="mt-3 flex flex-col items-center gap-1.5">
              {SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  onClick={() => ask(sug)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-iris-600/40 hover:text-iris-700"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                t.role === 'user'
                  ? 'bg-iris-600 text-white'
                  : 'border border-line bg-surface text-ink'
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-line bg-surface px-3.5 py-2.5">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-iris-600"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-line p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(draft)}
          placeholder="Ask about jobs, people, events…"
          className="flex-1 rounded-full border border-line bg-page px-4 py-2 text-sm outline-none focus:border-iris-600"
        />
        <button
          onClick={() => ask(draft)}
          disabled={!draft.trim() || thinking}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-iris-600 text-white hover:bg-iris-700 disabled:opacity-50"
          aria-label="Send"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
