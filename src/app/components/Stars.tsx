'use client';

import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  count: number;
  max?: number;
  className?: string;
}

/** 별 개수 표시. 총합(기본 6개) 중 보유한 만큼 금색으로 채움. */
export default function Stars({ count, max = 6, className = '' }: Props) {
  const { t } = useLanguage();
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-lg leading-none ${className}`}
      aria-label={t.room.starsAria(count)}
    >
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={i < count ? 'text-[#e8c547]' : 'text-[#2c2f32]'}
        >
          ★
        </span>
      ))}
      <span className="ml-1 text-sm font-bold text-[#e8c547]">{count}</span>
    </span>
  );
}
