import React, { memo } from 'react';

/**
 * Icon adapter supporting:
 * - Legacy Heroicons-style path strings: <Icon path="M..." />
 * - Tabler components: <Icon icon={IconCalendar} />
 */
const Icon = memo(function Icon({
  path,
  icon: IconComponent,
  className,
  size = 20,
  stroke = 1.5,
  ...rest
}) {
  if (IconComponent) {
    return (
      <IconComponent
        size={size}
        stroke={stroke}
        className={className}
        aria-hidden
        {...rest}
      />
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={stroke}
      stroke="currentColor"
      className={className}
      width={size}
      height={size}
      aria-hidden
      {...rest}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
});

export default Icon;
