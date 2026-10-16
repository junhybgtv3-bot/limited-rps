'use client';

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { en } from './en';
import { ja } from './ja';
import { ko, type Dict, type Lang } from './ko';

const LANG_KEY = 'lrps:lang';

const dicts: Record<Lang, Dict> = { ko, en, ja };

// 훅을 쓸 수 없는 모듈(socket.ts 타임아웃 메시지 등)에서 현재 언어를 읽기 위한 게터
let currentLang: Lang = 'en';
export function getLang(): Lang {
  return currentLang;
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ko',
  setLang: () => {},
  t: ko,
});

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === 'ko' || v === 'ja' ? v : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);
  const pathname = usePathname();

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      // 저장 실패 무시
    }
  }, []);

  // 언어 변경 + 라우트 이동 시에도 탭 제목이 선택 언어로 유지되도록 동기화
  // (App Router가 네비게이션마다 layout metadata 제목으로 document.title을 덮어씀)
  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.title = dicts[lang].meta.title;
  }, [lang, pathname]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: dicts[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** 상단 헤더용 한국어 | English | 日本語 세그먼트 컨트롤 */
export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const btn = (active: boolean) =>
    `px-3 py-1.5 text-xs font-bold transition ${
      active
        ? 'bg-[#b3122e] text-white'
        : 'text-[#9a9587] hover:text-[#ece7d8]'
    }`;
  return (
    <div
      className="inline-flex items-center gap-0.5 border-2 border-[#2c2f32] bg-[#141416]/90 p-1"
      role="group"
      aria-label="Language / 언어 / 言語"
    >
      <button
        type="button"
        onClick={() => setLang('ko')}
        className={btn(lang === 'ko')}
        aria-pressed={lang === 'ko'}
      >
        한국어
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={btn(lang === 'en')}
        aria-pressed={lang === 'en'}
      >
        English
      </button>
      <button
        type="button"
        onClick={() => setLang('ja')}
        className={btn(lang === 'ja')}
        aria-pressed={lang === 'ja'}
      >
        日本語
      </button>
    </div>
  );
}
