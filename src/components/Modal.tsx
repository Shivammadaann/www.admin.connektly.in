import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
};

export default function Modal({ title, description, isOpen, onClose, children, maxWidthClass = 'max-w-6xl' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
      <button type="button" className="fixed inset-0 cursor-default" onClick={onClose} aria-label="Close modal" />
      <section className={`relative mx-auto my-4 overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-2xl ${maxWidthClass}`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-tight text-gray-950">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-950"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}
