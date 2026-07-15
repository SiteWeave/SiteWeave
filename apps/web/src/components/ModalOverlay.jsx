import { createPortal } from 'react-dom';

/** Cap panel height so short viewports never clip the top. */
export const MODAL_PANEL_MAX_H = 'max-h-[min(90dvh,90vh)]';

/**
 * Scrollable centered overlay. Tall content scrolls the overlay instead of
 * clipping equally from top/bottom (classic flex items-center bug).
 */
export default function ModalOverlay({
  children,
  onClose,
  className = '',
  backdropClassName = '',
  zIndexClass = 'z-50',
  align = 'center',
  role,
  'aria-modal': ariaModal,
  'aria-labelledby': ariaLabelledBy,
}) {
  const handleBackdropClick = (e) => {
    if (!onClose) return;
    if (e.target === e.currentTarget) onClose();
  };

  const handleBackdropMouseDown = (e) => {
    if (e.target !== e.currentTarget) {
      e.stopPropagation();
    }
  };

  const innerAlign =
    align === 'start'
      ? 'min-h-full flex items-start justify-center p-4 pt-8 sm:pt-12'
      : 'min-h-full flex items-center justify-center p-4';

  const node = (
    <div
      className={`fixed inset-0 overflow-y-auto backdrop-blur-[2px] bg-black/20 ${zIndexClass} ${backdropClassName} ${className}`.trim()}
      onClick={handleBackdropClick}
      onMouseDown={handleBackdropMouseDown}
      role={role}
      aria-modal={ariaModal}
      aria-labelledby={ariaLabelledBy}
    >
      <div
        className={innerAlign}
        onClick={handleBackdropClick}
        onMouseDown={handleBackdropMouseDown}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
