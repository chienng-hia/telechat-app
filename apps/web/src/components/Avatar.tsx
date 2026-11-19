import React from 'react';

interface AvatarProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  isGroup?: boolean;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  color,
  size = 'md',
  online,
  isGroup = false,
}) => {
  const initial = (name.trim()[0] || '?').toUpperCase();

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-full font-semibold text-white select-none shadow-xs`}
        style={{ backgroundColor: color }}
      >
        {isGroup ? initial : initial}
      </div>
      {online !== undefined && online && (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
      )}
    </div>
  );
};
