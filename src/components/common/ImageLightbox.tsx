'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

interface ImageLightboxProps {
  src: string;
  closeLabel: string;
  onClose: () => void;
  alt?: string;
}

/**
 * A full-screen image viewer. Portalled to `document.body`: opened from inside a card or a modal,
 * a `fixed` overlay would otherwise be sized by the nearest ancestor with a `filter` or
 * `transform` (a card's hover brightness, a modal's open animation) instead of the viewport.
 */
export function ImageLightbox({
  src,
  closeLabel,
  onClose,
  alt = 'Attachment',
}: ImageLightboxProps) {
  // Escape closes only the viewer: caught in the capture phase, before a modal underneath sees it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    // Portalled events still bubble up the React tree — to a card that expands on click, or a
    // drag handle that starts dragging on pointer down or on Enter/Space — so none are let through.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[2000] flex cursor-zoom-out items-center justify-center bg-black/85 p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="relative h-full max-h-[90vh] w-full max-w-[90vw]">
        <Image src={src} alt={alt} fill sizes="90vw" className="object-contain" />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 text-[18px] leading-none text-white transition-colors hover:bg-[var(--rose)]"
        aria-label={closeLabel}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
