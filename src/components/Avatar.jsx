import React, { useEffect, useState } from 'react';

function Avatar({ name, avatarUrl = null, size = 'md', className = '' }) {
  // Extract initials from name
  const getInitials = (name) => {
    if (!name) return '?';
    
    const words = name.trim().split(' ');
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  };

  // Generate consistent color based on name
  const getColorFromName = (name) => {
    if (!name) return 'bg-gray-500';
    
    const colors = [
      'bg-red-500',
      'bg-blue-500', 
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-orange-500',
      'bg-teal-500',
      'bg-cyan-500'
    ];
    
    // Use name to consistently pick a color
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg'
  };

  const initials = getInitials(name);
  const colorClass = getColorFromName(name);
  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !imageFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'User avatar'}
        className={`${sizeClass.split(' ').slice(0, 2).join(' ')} rounded-full object-cover ${className}`}
        title={name}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div 
      className={`${sizeClass} ${colorClass} text-white rounded-full flex items-center justify-center font-semibold ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
}

export default Avatar;
