'use client';

import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, children }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="animate-rps-pop w-full max-w-sm border-2 border-[#b3122e]/50 bg-[#141416] p-6 shadow-[8px_8px_0_#000]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display mb-4 text-xl tracking-wide text-[#ece7d8]">
          <span className="mr-2 inline-block h-4 w-1.5 bg-[#c1121f]" aria-hidden="true" />
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
