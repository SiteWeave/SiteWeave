import React from 'react';

/**
 * Simple Modal Component
 * Reusable modal wrapper for consistent styling
 */
function Modal({ show, onClose, title, children, size = 'default' }) {
  if (!show) return null;

  const sizeClasses = {
    default: 'max-w-md',
    large: 'max-w-2xl',
    xl: 'max-w-4xl',
    xlarge: 'max-w-6xl'
  };

  const handleBackdropClick = (e) => {
    // Only close if clicking directly on the backdrop, not on child elements
    // This prevents closing when selecting text or clicking inside the modal
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 backdrop-blur-[2px] bg-black/20 flex items-center justify-center z-50" 
      onClick={handleBackdropClick}
      onMouseDown={(e) => {
        // Prevent closing when starting text selection
        if (e.target !== e.currentTarget) {
          e.stopPropagation();
        }
      }}
    >
      <div 
        className={`bg-white rounded-lg shadow-2xl p-6 w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{title}</h2>
            {onClose && (
              <button type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
