import Link from 'next/link';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
      <h2 className="mb-3 text-lg font-bold text-amber-300">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">
        {children}
      </div>
    </section>
  );
}

export default function HowToPlayPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#0b1220] to-[#020617] px-4 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-bold text-slate-200 transition active:scale-95"
          >
            ← 뒤로
          </Link>
          <h1 className="text-2xl font-black text-amber-300">게임 방법</h1>
        </div>

        <Section title="🎯 게임 목표">
          <p>
            상대방의 별을 <strong className="text-amber-200">0개</strong>로
            만들거나, 12라운드가 끝났을 때 별을 더 많이 보유하면 승리합니다.
          </p>
        </Section>

        <Section title="🃏 초기 지급">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              바위 ✊ / 가위 ✌️ / 보 ✋ 카드를 <strong>각 4장씩</strong> (총 12장)
              받습니다.
            </li>
            <li>
              별 ⭐을 <strong>3개씩</strong> 받습니다. (양쪽 합계 6개 유지)
            </li>
          </ul>
        </Section>

        <Section title="🔄 라운드 진행">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong className="text-slate-100">Check</strong> — 남은 카드를
              확인합니다.
            </li>
            <li>
              <strong className="text-slate-100">Set</strong> — 낼 카드를 고르고{' '}
              <strong className="text-amber-200">SET</strong> 버튼을 눌러
              제출합니다.
            </li>
            <li>
              <strong className="text-slate-100">Open</strong> — 양쪽이 모두
              제출하면 카드가 동시에 공개됩니다.
            </li>
            <li>
              <strong className="text-slate-100">Result</strong> — 승패를
              판정합니다.
            </li>
            <li>
              <strong className="text-slate-100">Update</strong> — 별이 이동하고
              다음 라운드로 넘어갑니다.
            </li>
          </ol>
          <p className="text-slate-400">
            상대가 무엇을 냈는지는 공개 전까지 절대 알 수 없습니다.
          </p>
        </Section>

        <Section title="⭐ 별 이동">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              이긴 사람은 별 <strong className="text-emerald-300">+1</strong>,
              진 사람은 별 <strong className="text-red-300">−1</strong>합니다.
            </li>
            <li>무승부면 별이 이동하지 않습니다.</li>
          </ul>
        </Section>

        <Section title="🏆 승리 조건 (3가지)">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              상대방의 별이 <strong className="text-amber-200">0개</strong>가
              되면 즉시 승리합니다.
            </li>
            <li>
              <strong className="text-amber-200">12라운드</strong>를 모두
              소모하면 별이 많은 쪽이 승리합니다. (동점이면 무승부)
            </li>
            <li>
              게임 시작 후 <strong className="text-amber-200">4시간</strong>이
              지나면 별이 많은 쪽이 승리합니다. (동점이면 무승부)
            </li>
          </ol>
        </Section>

        <Section title="🂠 카드 소모 규칙">
          <ul className="list-disc space-y-1 pl-5">
            <li>한 번 제출한 카드는 소모되어 다시 낼 수 없습니다.</li>
            <li>남은 장수가 0인 카드는 선택할 수 없습니다.</li>
            <li>같은 라운드에 카드를 두 번 제출할 수는 없습니다.</li>
          </ul>
        </Section>

        <Section title="🔌 연결이 끊겼을 때">
          <p>
            연결이 끊겨도 <strong className="text-amber-200">60초</strong> 안에
            다시 접속하면 게임을 이어서 할 수 있습니다. 60초가 지나면 몰수패
            처리됩니다.
          </p>
        </Section>

        <Link
          href="/"
          className="mt-2 w-full rounded-2xl bg-amber-400 px-6 py-4 text-center text-lg font-bold text-slate-900 transition active:scale-95"
        >
          메인으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
