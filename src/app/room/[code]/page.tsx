'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CARD_EMOJI,
  CARD_LABEL,
  TOTAL_ROUNDS,
  type CardType,
  type FinishReason,
  type LobbyState,
  type PlayerSlot,
  type PublicGameView,
  type RevealPayload,
} from '@/shared/types';
import {
  clearSession,
  emitAck,
  getSocket,
  loadSession,
  saveSession,
  type JoinAck,
  type ReconnectAck,
  type SubmitAck,
} from '@/app/lib/socket';
import { toast } from '@/app/components/Toaster';
import Stars from '@/app/components/Stars';
import CardButton from '@/app/components/CardButton';

type Phase = 'connecting' | 'join' | 'lobby' | 'game' | 'finished';

interface FinalResult {
  winner: PublicGameView['winner'];
  finishReason: FinishReason | null;
  view: PublicGameView;
}

const JOIN_ERROR_MSG: Record<string, string> = {
  NOT_FOUND: '방을 찾을 수 없습니다.',
  FULL: '방이 가득 찼습니다.',
  IN_PROGRESS: '진행 중인 게임입니다.',
  EXPIRED: '만료된 초대 코드입니다.',
  INVALID_CODE: '6자리 숫자 코드를 입력해 주세요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
};

const SUBMIT_ERROR_MSG: Record<string, string> = {
  NOT_PLAYING: '게임이 진행 중이 아닙니다.',
  ROUND_MISMATCH: '라운드가 바뀌었습니다. 다시 선택해 주세요.',
  ALREADY_SUBMITTED: '이미 제출했습니다.',
  NO_SUCH_CARD: '해당 카드가 없습니다.',
  UNKNOWN_SLOT: '알 수 없는 오류가 발생했습니다.',
};

const CARDS: CardType[] = ['rock', 'scissors', 'paper'];

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function deltaText(d: number): string {
  return d > 0 ? `+${d}` : `${d}`;
}

export default function RoomPage() {
  const params = useParams();
  const code = (
    Array.isArray(params.code) ? params.code[0] : params.code
  ) as string;
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('connecting');
  const [connFailed, setConnFailed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mySlot, setMySlot] = useState<PlayerSlot | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [view, setView] = useState<PublicGameView | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [revealDelta, setRevealDelta] = useState<{
    me: number;
    opp: number;
  } | null>(null);
  const [final, setFinal] = useState<FinalResult | null>(null);
  const [selected, setSelected] = useState<CardType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [joinName, setJoinName] = useState('');
  const [joinErr, setJoinErr] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);

  // 리스너 클로저가 최신 상태를 보도록 ref 동기화
  const phaseRef = useRef<Phase>('connecting');
  const mySlotRef = useRef<PlayerSlot | null>(null);
  const viewRef = useRef<PublicGameView | null>(null);
  const revealRef = useRef<RevealPayload | null>(null);
  const pendingFinishRef = useRef<FinalResult | null>(null);
  const attemptingRef = useRef(false);

  const setPhaseAll = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ---- 재접속 시도 ----
  const doReconnect = useCallback(async () => {
    if (attemptingRef.current) return;
    const sess = loadSession(code);
    if (!sess) {
      setPhaseAll('join');
      return;
    }
    attemptingRef.current = true;
    setConnFailed(false);
    try {
      const ack = await emitAck<ReconnectAck>(
        'room:reconnect',
        { roomCode: code, reconnectToken: sess.reconnectToken },
        12000,
      );
      if (ack.ok) {
        mySlotRef.current = ack.slot;
        setMySlot(ack.slot);
        if (ack.phase === 'game' && ack.game) {
          viewRef.current = ack.game;
          setView(ack.game);
          setSelected(null);
          setPhaseAll('game');
        } else {
          if (ack.lobby) setLobby(ack.lobby);
          setPhaseAll('lobby');
        }
      } else {
        clearSession(code);
        setJoinErr('세션이 만료되었습니다. 다시 참가해 주세요.');
        setPhaseAll('join');
      }
    } catch {
      setConnFailed(true);
    } finally {
      attemptingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const doReconnectRef = useRef(doReconnect);
  doReconnectRef.current = doReconnect;

  // ---- 소켓 리스너 ----
  useEffect(() => {
    const s = getSocket();
    setConnected(s.connected);

    const applyFinish = (fin: FinalResult) => {
      viewRef.current = fin.view;
      setView(fin.view);
      setReveal(null);
      setRevealDelta(null);
      revealRef.current = null;
      pendingFinishRef.current = null;
      clearSession(code);
      setFinal(fin);
      setPhaseAll('finished');
    };

    const onConnect = () => {
      setConnected(true);
      void doReconnectRef.current();
    };
    const onDisconnect = () => setConnected(false);

    const onLobbyUpdate = (p: { lobby: LobbyState }) => {
      setLobby(p.lobby);
      if (phaseRef.current !== 'finished') setPhaseAll('lobby');
    };

    const onGameStart = (p: { view: PublicGameView }) => {
      viewRef.current = p.view;
      setView(p.view);
      setSelected(null);
      setReveal(null);
      setPhaseAll('game');
    };

    const onGameUpdate = (p: { view: PublicGameView }) => {
      const prev = viewRef.current;
      viewRef.current = p.view;
      setView(p.view);
      if (prev && prev.roundId !== p.view.roundId) setSelected(null);
    };

    const onGameReveal = (p: {
      reveal: RevealPayload;
      view: PublicGameView;
    }) => {
      const prev = viewRef.current;
      const slot = mySlotRef.current;
      revealRef.current = p.reveal;
      setReveal(p.reveal);
      if (slot && prev) {
        const opp: PlayerSlot = slot === 'A' ? 'B' : 'A';
        setRevealDelta({
          me: p.reveal.stars[slot] - prev.me.stars,
          opp: p.reveal.stars[opp] - prev.opponent.stars,
        });
      } else {
        setRevealDelta(null);
      }
      setSelected(null);
      window.setTimeout(() => {
        revealRef.current = null;
        viewRef.current = p.view;
        setView(p.view);
        setReveal(null);
        setRevealDelta(null);
        const fin = pendingFinishRef.current;
        if (fin) applyFinish(fin);
      }, 2500);
    };

    const onGameFinish = (p: {
      winner: PublicGameView['winner'];
      finishReason: FinishReason | null;
      view: PublicGameView;
    }) => {
      const fin: FinalResult = {
        winner: p.winner,
        finishReason: p.finishReason,
        view: p.view,
      };
      if (revealRef.current) {
        pendingFinishRef.current = fin;
      } else {
        applyFinish(fin);
      }
    };

    const onOpponentStatus = (p: {
      slot: PlayerSlot;
      connected: boolean;
    }) => {
      if (p.slot === mySlotRef.current) return;
      const update = (v: PublicGameView | null) =>
        v ? { ...v, opponent: { ...v.opponent, connected: p.connected } } : v;
      viewRef.current = update(viewRef.current);
      setView((v) => update(v));
    };

    const onRoomError = (p: { code: string; message?: string }) => {
      toast(p.message || '오류가 발생했습니다.', 'error');
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('lobby:update', onLobbyUpdate);
    s.on('game:start', onGameStart);
    s.on('game:update', onGameUpdate);
    s.on('game:reveal', onGameReveal);
    s.on('game:finish', onGameFinish);
    s.on('opponent:status', onOpponentStatus);
    s.on('room:error', onRoomError);

    void doReconnectRef.current();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('lobby:update', onLobbyUpdate);
      s.off('game:start', onGameStart);
      s.off('game:update', onGameUpdate);
      s.off('game:reveal', onGameReveal);
      s.off('game:finish', onGameFinish);
      s.off('opponent:status', onOpponentStatus);
      s.off('room:error', onRoomError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 게임 중 1초 카운트다운
  useEffect(() => {
    if (phase !== 'game') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // ---- 액션 ----
  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const name = joinName.trim();
    if (!name) {
      setJoinErr('닉네임을 입력해 주세요.');
      return;
    }
    setJoinBusy(true);
    setJoinErr('');
    try {
      const ack = await emitAck<JoinAck>('room:join', {
        roomCode: code,
        nickname: name,
      });
      if (ack.ok) {
        saveSession(code, {
          slot: ack.slot,
          reconnectToken: ack.reconnectToken,
        });
        mySlotRef.current = ack.slot;
        setMySlot(ack.slot);
        setPhaseAll('lobby'); // 이후 lobby:update 로 상세 갱신
      } else {
        setJoinErr(
          JOIN_ERROR_MSG[ack.code] ?? ack.message ?? '참가에 실패했습니다.',
        );
      }
    } catch {
      setJoinErr('서버에 연결할 수 없습니다.');
    } finally {
      setJoinBusy(false);
    }
  };

  const toggleReady = () => {
    const me = lobby?.players.find((p) => p.slot === mySlot);
    getSocket().emit('lobby:ready', { ready: !(me?.ready ?? false) });
  };

  const leaveRoom = () => {
    try {
      getSocket().emit('lobby:leave', {});
    } catch {
      // 무시
    }
    clearSession(code);
    router.push('/');
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} 복사되었습니다.`, 'success');
    } catch {
      toast('복사에 실패했습니다.', 'error');
    }
  };

  const submitCard = async () => {
    if (!selected || !view || submitting || view.me.submitted) return;
    setSubmitting(true);
    try {
      const ack = await emitAck<SubmitAck>('game:submit', {
        roundId: view.roundId,
        card: selected,
      });
      if (!ack.ok) {
        toast(
          SUBMIT_ERROR_MSG[ack.code] ?? '제출에 실패했습니다.',
          'error',
        );
        if (ack.code === 'ROUND_MISMATCH') setSelected(null);
      }
    } catch {
      toast('서버에 연결할 수 없습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pageClass =
    'min-h-screen bg-gradient-to-b from-[#0f172a] via-[#0b1220] to-[#020617] px-4 py-6 text-slate-100';

  // ============ 연결 중 ============
  if (phase === 'connecting') {
    return (
      <main className={`${pageClass} flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl" aria-hidden="true">
            ⏳
          </div>
          <p className="text-lg font-bold text-slate-200">
            {connFailed ? '서버에 연결할 수 없습니다.' : '연결 중...'}
          </p>
          {connFailed && (
            <button
              type="button"
              onClick={() => void doReconnectRef.current()}
              className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-slate-900 transition active:scale-95"
            >
              다시 시도
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm text-slate-400 underline"
          >
            메인으로
          </button>
        </div>
      </main>
    );
  }

  // ============ 참가 (토큰 없음) ============
  if (phase === 'join') {
    return (
      <main className={`${pageClass} flex items-center justify-center`}>
        <form
          onSubmit={handleJoin}
          className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/80 p-6"
        >
          <p className="mb-1 text-center text-sm text-slate-400">방 코드</p>
          <p className="mb-5 text-center text-3xl font-black tracking-[0.3em] text-amber-300">
            {code}
          </p>
          <label className="mb-1 block text-sm font-semibold text-slate-300">
            닉네임
          </label>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            maxLength={12}
            placeholder="닉네임 입력"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-lg text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          />
          {joinErr && (
            <p className="mt-3 text-center text-sm font-medium text-red-400">
              {joinErr}
            </p>
          )}
          <button
            type="submit"
            disabled={joinBusy}
            className="mt-4 w-full rounded-xl bg-amber-400 px-6 py-3 text-base font-bold text-slate-900 transition active:scale-95 disabled:opacity-50"
          >
            {joinBusy ? '참가 중...' : '방 참가하기'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-3 w-full text-center text-sm text-slate-400 underline"
          >
            메인으로
          </button>
        </form>
      </main>
    );
  }

  // ============ 로비 ============
  if (phase === 'lobby') {
    const slots: PlayerSlot[] = ['A', 'B'];
    const me = lobby?.players.find((p) => p.slot === mySlot);
    const inviteUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${lobby?.inviteUrlPath ?? `/room/${code}`}`
        : `/room/${code}`;

    return (
      <main className={pageClass}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <div className="text-center">
            <p className="text-sm text-slate-400">방 코드</p>
            <p className="text-5xl font-black tracking-[0.2em] text-amber-300">
              {code}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => void copyText(code, '방 코드가')}
                className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-bold text-slate-200 transition active:scale-95"
              >
                📋 코드 복사
              </button>
              <button
                type="button"
                onClick={() => void copyText(inviteUrl, '초대 URL이')}
                className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm font-bold text-slate-200 transition active:scale-95"
              >
                🔗 초대 URL 복사
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {slots.map((slot, i) => {
              const p = lobby?.players.find((x) => x.slot === slot);
              const isMe = slot === mySlot;
              return (
                <div
                  key={slot}
                  className={`rounded-2xl border p-4 ${
                    isMe
                      ? 'border-amber-400/50 bg-amber-400/5'
                      : 'border-slate-700 bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">
                        플레이어 {i + 1}
                        {isMe && (
                          <span className="ml-1 font-bold text-amber-300">
                            (나)
                          </span>
                        )}
                      </p>
                      <p className="text-lg font-bold text-slate-100">
                        {p ? p.nickname : '대기 중...'}
                      </p>
                    </div>
                    {p && (
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-sm font-bold ${p.connected ? 'text-emerald-400' : 'text-slate-500'}`}
                        >
                          {p.connected ? '●' : '○'}{' '}
                          {p.connected ? '연결됨' : '끊김'}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            p.ready
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-700/60 text-slate-300'
                          }`}
                        >
                          {p.ready ? '준비 완료' : '준비 중'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!lobby && (
            <p className="text-center text-sm text-slate-400">
              로비 정보를 불러오는 중...
            </p>
          )}

          <button
            type="button"
            onClick={toggleReady}
            disabled={!me}
            className={`w-full rounded-2xl px-6 py-4 text-lg font-bold transition active:scale-95 disabled:opacity-50 ${
              me?.ready
                ? 'border-2 border-slate-600 bg-slate-800 text-slate-200'
                : 'bg-amber-400 text-slate-900 shadow-[0_0_24px_rgba(245,197,24,0.25)]'
            }`}
          >
            {me?.ready ? '준비 취소' : '준비 완료'}
          </button>
          <p className="text-center text-xs text-slate-500">
            두 플레이어가 모두 준비하면 게임이 시작됩니다.
          </p>

          <button
            type="button"
            onClick={leaveRoom}
            className="w-full rounded-2xl border border-slate-700 bg-slate-800/40 px-6 py-3 text-base font-bold text-slate-300 transition active:scale-95"
          >
            방 나가기
          </button>
        </div>
      </main>
    );
  }

  // ============ 종료 화면 ============
  if (phase === 'finished' && final) {
    const fview = final.view;
    const mySlotNow = mySlot ?? fview.me.slot;
    const isDraw = final.winner === 'draw';
    const isWin = final.winner === mySlotNow;

    const title = isDraw ? '무승부' : isWin ? '승리!' : '패배';
    const titleColor = isDraw
      ? 'text-slate-200'
      : isWin
        ? 'text-emerald-300'
        : 'text-red-400';

    let desc = '게임이 종료되었습니다.';
    if (final.finishReason === 'stars_zero') {
      desc = isWin
        ? '상대의 별을 모두 빼앗았습니다!'
        : '별을 모두 잃었습니다.';
    } else if (final.finishReason === 'cards_exhausted') {
      desc = isDraw
        ? '12라운드를 모두 마쳤지만 별이 동점이라 무승부입니다.'
        : '12라운드를 모두 마쳤습니다. 별이 많은 쪽이 승리합니다.';
    } else if (final.finishReason === 'timeout') {
      desc = isDraw
        ? '제한 시간 4시간이 종료되었고 별이 동점이라 무승부입니다.'
        : '제한 시간 4시간이 종료되었습니다. 별이 많은 쪽이 승리합니다.';
    } else if (final.finishReason === 'forfeit') {
      desc = isWin
        ? '상대의 연결이 끊어져 몰수승 처리되었습니다.'
        : '연결 문제로 몰수패 처리되었습니다.';
    }

    return (
      <main className={`${pageClass} flex items-center justify-center`}>
        <div className="animate-rps-pop flex w-full max-w-sm flex-col items-center rounded-2xl border border-slate-700 bg-slate-900/80 p-8">
          <div className="mb-2 text-6xl" aria-hidden="true">
            {isDraw ? '🤝' : isWin ? '🏆' : '😞'}
          </div>
          <h1 className={`text-4xl font-black ${titleColor}`}>{title}</h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-300">
            {desc}
          </p>
          <div className="mt-6 flex w-full items-center justify-between rounded-xl bg-slate-800/60 px-5 py-4">
            <div className="text-center">
              <p className="text-xs text-slate-400">나</p>
              <Stars count={fview.me.stars} />
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">
                {fview.opponent.nickname || '상대'}
              </p>
              <Stars count={fview.opponent.stars} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-6 w-full rounded-2xl bg-amber-400 px-6 py-4 text-lg font-bold text-slate-900 transition active:scale-95"
          >
            메인으로
          </button>
        </div>
      </main>
    );
  }

  // ============ 게임 화면 ============
  if (phase === 'game' && view) {
    const mySlotNow = mySlot ?? view.me.slot;
    const oppSlot: PlayerSlot = mySlotNow === 'A' ? 'B' : 'A';
    const remaining = new Date(view.deadlineAt).getTime() - now;
    const submitted = view.me.submitted;

    const revealMyCard = reveal ? reveal.choices[mySlotNow] : null;
    const revealOppCard = reveal ? reveal.choices[oppSlot] : null;
    const revealWon =
      reveal && mySlot ? reveal.result === mySlot : false;
    const revealDraw = reveal?.result === 'draw';

    return (
      <main className={pageClass}>
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col gap-4">
          {/* 상단 바 */}
          <header className="flex items-center justify-between rounded-2xl border border-slate-700/60 bg-slate-900/60 px-4 py-3">
            <div className="text-sm font-bold text-slate-300">
              방 <span className="text-amber-300">{code}</span>
            </div>
            <div className="text-sm font-bold text-slate-200">
              ⏱ {formatRemaining(remaining)}
            </div>
            <div className="text-sm font-bold text-slate-200">
              {view.roundNumber} / {TOTAL_ROUNDS}R
            </div>
            <div
              className={`text-sm font-bold ${connected ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {connected ? '●' : '○'}
            </div>
          </header>

          {/* 상대 패널 */}
          <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">상대</p>
                <p className="text-lg font-bold text-slate-100">
                  {view.opponent.nickname || '상대방'}
                </p>
              </div>
              {!view.opponent.connected && (
                <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300">
                  연결 끊김
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Stars count={view.opponent.stars} />
              <span className="text-sm text-slate-300">
                남은 카드 <strong>{view.opponent.totalCards}장</strong>
              </span>
            </div>
            <div className="mt-2">
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                  view.opponent.submitted
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-700/60 text-slate-300'
                }`}
              >
                {view.opponent.submitted ? '제출 완료' : '선택 중...'}
              </span>
            </div>
          </section>

          {/* 내 패널 */}
          <section className="rounded-2xl border border-amber-400/30 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">나</p>
                <p className="text-lg font-bold text-slate-100">
                  {view.me.nickname}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Stars count={view.me.stars} />
              <span className="text-sm text-slate-300">
                남은 카드{' '}
                <strong>
                  {view.me.hand.rock +
                    view.me.hand.scissors +
                    view.me.hand.paper}
                  장
                </strong>
              </span>
            </div>
            <div className="mt-2 flex gap-2 text-sm">
              {CARDS.map((c) => (
                <span
                  key={c}
                  className="flex-1 rounded-lg bg-slate-800/70 px-2 py-1 text-center font-bold text-slate-200"
                >
                  {CARD_EMOJI[c]} {CARD_LABEL[c]} ×{view.me.hand[c]}
                </span>
              ))}
            </div>
          </section>

          <div className="flex-1" />

          {/* 하단: 카드 선택 + SET */}
          {!submitted ? (
            <>
              <div className="flex gap-2">
                {CARDS.map((c) => (
                  <CardButton
                    key={c}
                    card={c}
                    count={view.me.hand[c]}
                    selected={selected === c}
                    disabled={view.me.hand[c] === 0 || submitting}
                    onSelect={setSelected}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => void submitCard()}
                disabled={!selected || submitting}
                className="w-full rounded-2xl bg-amber-400 px-6 py-4 text-xl font-black text-slate-900 shadow-[0_0_24px_rgba(245,197,24,0.25)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {submitting ? '제출 중...' : 'SET'}
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 text-center">
              <p className="text-lg font-bold text-slate-200">
                {view.opponent.submitted
                  ? '결과를 공개하는 중...'
                  : '상대방을 기다리는 중...'}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                제출한 카드: {selected ? `${CARD_EMOJI[selected]} ${CARD_LABEL[selected]}` : view.me.choice ? `${CARD_EMOJI[view.me.choice]} ${CARD_LABEL[view.me.choice]}` : '—'}
              </p>
            </div>
          )}
        </div>

        {/* 결과 오버레이 */}
        {reveal && revealMyCard && revealOppCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="animate-rps-pop w-full max-w-sm rounded-2xl border border-amber-400/40 bg-slate-900 p-6 text-center">
              <p className="text-sm font-bold text-slate-400">
                {reveal.roundNumber}라운드 결과
              </p>
              <div className="mt-4 flex items-center justify-around">
                <div>
                  <p className="mb-1 text-xs text-slate-400">나</p>
                  <p className="text-6xl">{CARD_EMOJI[revealMyCard]}</p>
                  <p className="mt-1 text-sm font-bold text-slate-200">
                    {CARD_LABEL[revealMyCard]}
                  </p>
                  {revealDelta && (
                    <p
                      className={`mt-1 text-sm font-bold ${revealDelta.me >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                    >
                      ⭐ {deltaText(revealDelta.me)}
                    </p>
                  )}
                </div>
                <p className="text-3xl font-black text-slate-500">VS</p>
                <div>
                  <p className="mb-1 text-xs text-slate-400">상대</p>
                  <p className="text-6xl">{CARD_EMOJI[revealOppCard]}</p>
                  <p className="mt-1 text-sm font-bold text-slate-200">
                    {CARD_LABEL[revealOppCard]}
                  </p>
                  {revealDelta && (
                    <p
                      className={`mt-1 text-sm font-bold ${revealDelta.opp >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                    >
                      ⭐ {deltaText(revealDelta.opp)}
                    </p>
                  )}
                </div>
              </div>
              <p
                className={`mt-5 text-3xl font-black ${
                  revealDraw
                    ? 'text-slate-200'
                    : revealWon
                      ? 'text-emerald-300'
                      : 'text-red-400'
                }`}
              >
                {revealDraw ? '무승부' : revealWon ? '승리!' : '패배'}
              </p>
            </div>
          </div>
        )}
      </main>
    );
  }

  // 폴백 (상태 전이 중)
  return (
    <main className={`${pageClass} flex items-center justify-center`}>
      <p className="text-slate-400">불러오는 중...</p>
    </main>
  );
}
