'use client';

import Link from 'next/link';
import { ZawaBackground } from '../components/Kaiji';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-2 border-[#2c2f32] bg-[#141416] p-5">
      <h2 className="font-display mb-3 text-lg tracking-wide text-[#ece7d8]">
        <span className="mr-2 inline-block h-4 w-1.5 bg-[#c1121f]" aria-hidden="true" />
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-[#9a9587]">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  const { t } = useLanguage();
  const p = t.privacy;

  const sections = [
    { title: p.collectTitle, body: p.collectBody },
    { title: p.notCollectTitle, body: p.notCollectBody },
    { title: p.retentionTitle, body: p.retentionBody },
    { title: p.contactTitle, body: p.contactBody },
  ];

  return (
    <main className="kaiji-bg relative min-h-screen overflow-hidden px-4 py-8 text-[#ece7d8]">
      <ZawaBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="kaiji-btn kaiji-btn-ghost px-3 py-2 text-sm font-bold"
          >
            {p.back}
          </Link>
          <h1 className="font-display text-2xl tracking-wide text-[#ece7d8]">{p.title}</h1>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </div>

        <p className="text-xs text-[#6b675c]">{p.updated}</p>
        <p className="text-sm leading-relaxed text-[#9a9587]">{p.intro}</p>

        {sections.map((s) => (
          <Section key={s.title} title={s.title}>
            {s.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </Section>
        ))}

        <Link
          href="/"
          className="kaiji-btn kaiji-btn-ghost mt-2 px-4 py-3 text-center text-sm font-bold"
        >
          {p.backToMain}
        </Link>
      </div>
    </main>
  );
}
