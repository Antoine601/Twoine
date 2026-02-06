import clsx from 'clsx'

export default function Loading({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }

  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div
        className={clsx(
          sizes[size],
          'border-primary-600 border-t-transparent rounded-full animate-spin'
        )}
      />
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="flex-1 flex items-center justify-center py-20">
      <Loading size="lg" />
    </div>
  )
}

export function CardLoading() {
  return (
    <div className="card p-8">
      <Loading />
    </div>
  )
}
