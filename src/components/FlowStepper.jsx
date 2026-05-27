/**
 * FlowStepper — thin progress indicator for campaign flow pages.
 * Shows: Describe → Contacts → Approve → Schedule
 */
const STEPS = [
  { id: 'describe',  label: 'Describe'  },
  { id: 'contacts',  label: 'Contacts'  },
  { id: 'approve',   label: 'Approve'   },
  { id: 'schedule',  label: 'Schedule'  },
]

export default function FlowStepper({ current }) {
  const currentIdx = STEPS.findIndex(s => s.id === current)

  return (
    <div className="flex items-center gap-0 mb-7">
      {STEPS.map((step, i) => {
        const done    = i < currentIdx
        const active  = i === currentIdx
        const upcoming = i > currentIdx

        return (
          <div key={step.id} className="flex items-center">
            {/* Step dot + label */}
            <div className="flex flex-col items-center gap-1">
              <div className={`
                w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all
                ${done    ? 'bg-brand-500 text-white'            : ''}
                ${active  ? 'bg-brand-500 text-white ring-4 ring-brand-100' : ''}
                ${upcoming? 'bg-gray-100 text-gray-400'           : ''}
              `}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide whitespace-nowrap
                ${active   ? 'text-brand-600' : ''}
                ${done     ? 'text-gray-400'  : ''}
                ${upcoming ? 'text-gray-300'  : ''}
              `}>
                {step.label}
              </span>
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-0.5 mb-4 mx-1 transition-all ${done ? 'bg-brand-400' : 'bg-gray-150'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
