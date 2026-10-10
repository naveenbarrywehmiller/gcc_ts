import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, size = 'md', footer }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    // Remember the opener before a child with autoFocus receives focus on mount.
    const rememberOutsideFocus = event => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[role="dialog"]')?.getAttribute('aria-labelledby') !== titleId) {
        returnFocusRef.current = target;
      }
    };
    rememberOutsideFocus({ target: document.activeElement });
    document.addEventListener('focusin', rememberOutsideFocus);
    return () => document.removeEventListener('focusin', rememberOutsideFocus);
  }, [titleId]);
  useEffect(() => {
    if (isOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = returnFocusRef.current || document.activeElement;
    closeRef.current?.focus();
    const handleKeys = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeys);
    return () => { document.removeEventListener('keydown', handleKeys); if (previousFocus?.isConnected) previousFocus.focus?.(); };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return createPortal(
    // Keep backdrop clicks inert; selection drags can end outside the popup.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 modal-backdrop"
    >
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative w-full min-w-0 ${sizes[size]} bg-white dark:bg-surface-900 rounded-xl
        shadow-2xl border border-surface-200 dark:border-surface-800 animate-scale-in
        max-h-[calc(100dvh-1rem)] sm:max-h-[85vh] flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-200 dark:border-surface-800 shrink-0">
          <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold text-surface-900 dark:text-surface-100">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close popup"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100
              dark:hover:text-surface-300 dark:hover:bg-surface-800 transition-colors"
            id="modal-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Body */}
        <div className="min-h-0 min-w-0 px-4 sm:px-6 py-4 overflow-auto flex-1">
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-surface-200 dark:border-surface-800 flex flex-wrap items-center justify-end gap-2 sm:gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
