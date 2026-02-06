import clsx from 'clsx'

export default function Loading({ size = 'md', className }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }

  return (
    <div className={clsx(
      'border-primary-600 border-t-transparent rounded-full animate-spin',
      sizes[size],
      className
    )} />
  )
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-4">
        <Loading size="lg" />
        <p className="text-admin-400">Chargement...</p>
      </div>
    </div>
  )
}

export function InlineLoading({ text = 'Chargement...' }) {
  return (
    <div className="flex items-center gap-2 text-admin-400">
      <Loading size="sm" />
      <span className="text-sm">{text}</span>
    </div>
  )
}
