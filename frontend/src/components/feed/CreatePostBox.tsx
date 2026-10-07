import { Briefcase, GraduationCap, Image as ImageIcon, Search } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../layout/LayoutContext'
import { Avatar, Card } from '../ui'

export function CreatePostBox() {
  const { currentUser } = useApp()
  const { openComposer } = useLayout()

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <Avatar name={currentUser.name} src={currentUser.photo} size={44} />
        <button
          onClick={() => openComposer()}
          className="flex-1 rounded-full border border-line bg-page px-4 py-2.5 text-left text-sm font-medium text-muted transition-colors hover:border-brand/40 hover:bg-surface"
        >
          Share an update, achievement or opportunity…
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-around border-t border-line pt-2">
        <Quick icon={<ImageIcon size={18} className="text-emerald-500" />} label="Photo" hover="hover:bg-emerald-50 hover:text-emerald-700" onClick={() => openComposer()} />
        <Quick icon={<Briefcase size={18} className="text-green-600" />} label="Hiring" hover="hover:bg-green-50 hover:text-green-700" onClick={() => openComposer({ type: 'Hiring' })} />
        <Quick icon={<Search size={18} className="text-blue-600" />} label="Open to Work" hover="hover:bg-blue-50 hover:text-blue-700" onClick={() => openComposer({ type: 'Open to Work' })} />
        <Quick icon={<GraduationCap size={18} className="text-brand" />} label="Mentorship" hover="hover:bg-brand-50 hover:text-brand" onClick={() => openComposer({ type: 'Mentorship' })} />
      </div>
    </Card>
  )
}

function Quick({
  icon,
  label,
  hover,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hover: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors ${hover}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
