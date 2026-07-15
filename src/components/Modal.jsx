import ModalOverlay, { MODAL_PANEL_MAX_H } from './ModalOverlay';

/**
 * Reusable modal wrapper for consistent, viewport-safe styling.
 */
function Modal({ show, onClose, title, children, size = 'default' }) {
  if (!show) return null;

  const sizeClasses = {
    default: 'max-w-md',
    large: 'max-w-2xl',
    xl: 'max-w-4xl',
    xlarge: 'max-w-6xl',
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className={`bg-white rounded-lg shadow-2xl p-6 w-full ${sizeClasses[size]} ${MODAL_PANEL_MAX_H} overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{title}</h2>
            {onClose && (
              <button
                type="button"
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
    </ModalOverlay>
  );
}

export default Modal;
