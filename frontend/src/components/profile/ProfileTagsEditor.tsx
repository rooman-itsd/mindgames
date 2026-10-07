import { useState } from 'react'
import { Award, Briefcase, Search, Handshake, BookOpen, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Button } from '../ui'
import { PROFILE_TAGS, type ProfileTag } from '../../types'

const TAG_INFO: Record<ProfileTag, {
  label: string
  icon: React.ReactNode
  description: string
}> = {
  'Mentor': {
    label: 'Mentor',
    icon: <Award size={16} />,
    description: 'I can help guide and mentor others',
  },
  'Hiring': {
    label: 'Hiring',
    icon: <Briefcase size={16} />,
    description: 'My team is actively hiring',
  },
  'Open to Work': {
    label: 'Open to Work',
    icon: <Search size={16} />,
    description: 'I am actively looking for opportunities',
  },
  'Willing to give referral': {
    label: 'Willing to give referral',
    icon: <Handshake size={16} />,
    description: 'I can help with job referrals (verified if employer confirmed + 50 connections)',
  },
  'Need mentorship': {
    label: 'Need mentorship',
    icon: <BookOpen size={16} />,
    description: 'I am looking for guidance and mentorship',
  },
}

export function ProfileTagsEditor({
  currentTags,
  onSave,
  onCancel,
}: {
  currentTags: ProfileTag[]
  onSave: (tags: ProfileTag[]) => Promise<void>
  onCancel: () => void
}) {
  const { notify } = useApp()
  const [selectedTags, setSelectedTags] = useState<Set<ProfileTag>>(new Set(currentTags))
  const [saving, setSaving] = useState(false)

  const toggleTag = (tag: ProfileTag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(Array.from(selectedTags))
      notify('Profile tags updated.', 'success')
      onCancel()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update tags.', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Edit Profile Tags</h2>
          <button
            onClick={onCancel}
            className="rounded-full p-1 text-muted hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-muted">
            Select the tags that best describe you. These will be visible on your profile.
          </p>

          <div className="space-y-2">
            {PROFILE_TAGS.map((tag) => {
              const info = TAG_INFO[tag]
              const isSelected = selectedTags.has(tag)

              return (
                <label
                  key={tag}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-page"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleTag(tag)}
                    className="mt-1 h-5 w-5 cursor-pointer accent-brand"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-brand">{info.icon}</span>
                      <span className="font-semibold text-ink">{info.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{info.description}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || selectedTags.size === 0}
            loading={saving}
          >
            Save Tags
          </Button>
        </div>
      </div>
    </div>
  )
}
