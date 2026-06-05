import React from 'react';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Skeleton({ className = '', style }) {
  return (
    <div
      className={cx('animate-pulse rounded-md bg-slate-100', className)}
      style={style}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  const widths = ['w-full', 'w-5/6', 'w-2/3', 'w-1/2'];
  return (
    <div className={cx('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cx('h-3', widths[i % widths.length])} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = 'h-28', rounded = 'rounded-2xl' }) {
  return <Skeleton className={cx(rounded, className)} />;
}

export function SkeletonRow({ className = 'h-14' }) {
  return <Skeleton className={cx('rounded-xl', className)} />;
}

export function SkeletonList({ count = 4, rowClassName = 'h-14', className = 'space-y-3' }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} className={rowClassName} />
      ))}
    </div>
  );
}
