import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from './Button';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-[9px] animate-skeleton ${className}`} />;
}

export function WorkspaceSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <Skeleton className="h-14 w-full rounded-[14px]" />
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_260px] gap-4">
        <Skeleton className="hidden lg:block h-72 rounded-[14px]" />
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-[14px]" />
          <Skeleton className="h-16 rounded-[12px]" />
          <Skeleton className="h-16 rounded-[12px]" />
        </div>
        <Skeleton className="hidden lg:block h-72 rounded-[14px]" />
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-12 h-12 rounded-[12px] glass-light flex items-center justify-center text-[var(--color-primary)] mb-3">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="text-[13px] text-[var(--color-text-secondary)] max-w-xs mt-1 leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Coba Lagi',
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-12 h-12 rounded-[12px] bg-[var(--color-danger)]/12 text-[var(--color-danger)] flex items-center justify-center mb-3">
        <CircleAlert size={22} strokeWidth={1.9} />
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
      <p className="text-[13px] text-[var(--color-text-secondary)] max-w-sm mt-1 leading-relaxed">
        {description}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
