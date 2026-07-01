interface BackIconButtonProps {
  label: string
  onClick?: () => void
  darkMode: boolean
  className?: string
}

export default function BackIconButton({ label, onClick, darkMode, className = '' }: BackIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
        darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-slate-700 hover:bg-gray-100'
      } ${className}`}
      onClick={onClick}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
      >
        <path d="M19 12H5" />
        <path d="M12 5l-7 7 7 7" />
      </svg>
    </button>
  )
}
