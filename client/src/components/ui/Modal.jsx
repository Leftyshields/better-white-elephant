/**
 * Modal Component
 * Isolated component ready for Tailwind UI premium code
 */
import { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export function Modal({ isOpen, onClose, title, children, className = '' }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`bg-slate-900/95 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="sticky top-0 backdrop-blur-xl bg-slate-900/80 z-10 px-6 py-4 border-b border-white/10 flex items-center justify-between">
            {title && (
              <h3 className="text-lg font-semibold text-white">{title}</h3>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="ml-auto text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}


