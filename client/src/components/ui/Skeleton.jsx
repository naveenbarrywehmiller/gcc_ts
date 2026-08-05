export function LoadingSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex items-center gap-4 mb-6">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-8 w-32 rounded-lg" />
      </div>
      {/* Table skeleton */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-surface-200 dark:border-surface-800">
          <div className="flex gap-3">
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} className="skeleton h-4 flex-1 rounded" />
            ))}
          </div>
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 border-b border-surface-100 dark:border-surface-800/50">
            <div className="flex gap-3">
              {Array.from({ length: cols }).map((_, j) => (
                <div key={j} className="skeleton h-4 flex-1 rounded" style={{ animationDelay: `${(i * cols + j) * 50}ms` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
          <div className="skeleton h-4 w-20 mb-3 rounded" />
          <div className="skeleton h-8 w-24 mb-2 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

export function TimesheetSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 rounded" />
          <div className="skeleton h-6 w-40 rounded" />
          <div className="skeleton h-8 w-8 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-24 rounded-lg" />
          <div className="skeleton h-9 w-24 rounded-lg" />
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Header */}
            <div className="flex border-b border-surface-200 dark:border-surface-800 p-2 gap-1">
              <div className="skeleton h-6 w-48 rounded" />
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="skeleton h-6 w-10 rounded" />
              ))}
            </div>
            {/* Rows */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex border-b border-surface-100 dark:border-surface-800/50 p-2 gap-1">
                <div className="skeleton h-8 w-48 rounded" />
                {Array.from({ length: 15 }).map((_, j) => (
                  <div key={j} className="skeleton h-8 w-10 rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
