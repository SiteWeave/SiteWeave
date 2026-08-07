import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** Cap panel height so short viewports never clip the top. */
export const MODAL_PANEL_MAX_H = 'max-h-[min(90dvh,90vh)]';

const DEFAULT_BACKDROP = 'backdrop-blur-[2px] bg-black/20';

/**
 * Scrollable centered overlay portaled to document.body.
 * Avoids position:fixed breaking inside AppShell's overflow scroll container
 * (modal opens off-screen on short viewports until the user scrolls).
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
  useEffect(() => {
    if (!onClose) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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

  const backdrop = backdropClassName.trim() || DEFAULT_BACKDROP;

  const node = (
    <div
      className={`fixed inset-0 overflow-y-auto ${backdrop} ${zIndexClass} ${className}`.trim()}
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
