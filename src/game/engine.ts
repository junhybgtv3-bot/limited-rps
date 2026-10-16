// 순수 함수 게임 엔진 — I/O 없음, 입력 불변.
// 계약: docs/SPEC-INTERFACE.md §2

import {
  GAME_TIMEOUT_MS,
  INITIAL_HAND,
  INITIAL_STARS,
  type CardType,
  type FinishReason,
  type GameState,
  type HandCounts,
  type PlayerSlot,
  type PublicGameView,
  type RevealPayload,
  type RoundRecord,
  type RoundResult,
  type SubmitErrorCode,
} from '../shared/types';

export class GameError extends Error {
  code: SubmitErrorCode;
  constructor(code: SubmitErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'GameError';
    this.code = code;
  }
}

const opponentOf = (slot: PlayerSlot): PlayerSlot => (slot === 'A' ? 'B' : 'A');

function newRound(roundNumber: number): RoundRecord {
  return {
    roundId: crypto.randomUUID(),
    roundNumber,
    choices: { A: null, B: null },
    submitted: { A: false, B: false },
    result: null,
    resolvedAt: null,
  };
}

export function createGame(
  roomCode: string,
  nickA: string,
  nickB: string,
  now?: Date,
): GameState {
  const started = now ?? new Date();
  return {
    gameId: crypto.randomUUID(),
    roomCode,
    players: {
      A: { slot: 'A', nickname: nickA, hand: { ...INITIAL_HAND }, stars: INITIAL_STARS },
      B: { slot: 'B', nickname: nickB, hand: { ...INITIAL_HAND }, stars: INITIAL_STARS },
    },
    roundNumber: 1,
    currentRound: newRound(1),
    status: 'playing',
    winner: null,
    finishReason: null,
    startedAt: started.toISOString(),
    deadlineAt: new Date(started.getTime() + GAME_TIMEOUT_MS).toISOString(),
    history: [],
  };
}

export function submitCard(
  state: GameState,
  slot: PlayerSlot,
  card: CardType,
  roundId: string,
): GameState {
  if (slot !== 'A' && slot !== 'B') {
    throw new GameError('UNKNOWN_SLOT', `unknown slot: ${String(slot)}`);
  }
  if (state.status !== 'playing') {
    throw new GameError('NOT_PLAYING', `game status is ${state.status}`);
  }
  if (roundId !== state.currentRound.roundId) {
    throw new GameError('ROUND_MISMATCH', 'roundId does not match current round');
  }
  if (state.currentRound.submitted[slot]) {
    throw new GameError('ALREADY_SUBMITTED', `${slot} already submitted this round`);
  }
  if (state.players[slot].hand[card] <= 0) {
    throw new GameError('NO_SUCH_CARD', `${slot} has no ${card} left`);
  }
  const player = state.players[slot];
  return {
    ...state,
    players: {
      ...state.players,
      [slot]: {
        ...player,
        hand: { ...player.hand, [card]: player.hand[card] - 1 },
      },
    },
    currentRound: {
      ...state.currentRound,
      choices: { ...state.currentRound.choices, [slot]: card },
      submitted: { ...state.currentRound.submitted, [slot]: true },
    },
  };
}

export function bothSubmitted(state: GameState): boolean {
  return state.currentRound.submitted.A && state.currentRound.submitted.B;
}

export function resolveRound(
  state: GameState,
  now?: Date,
): { state: GameState; reveal: RevealPayload } {
  if (!bothSubmitted(state)) {
    throw new Error('resolveRound requires both players to have submitted');
  }
  const at = now ?? new Date();
  const choiceA = state.currentRound.choices.A as CardType;
  const choiceB = state.currentRound.choices.B as CardType;
  const result = beats(choiceA, choiceB);

  const stars: Record<PlayerSlot, number> = {
    A: state.players.A.stars,
    B: state.players.B.stars,
  };
  if (result !== 'draw') {
    const loser = opponentOf(result);
    stars[result] += 1;
    stars[loser] = Math.max(0, stars[loser] - 1); // 0 미만 방지, 총합 6 유지
  }

  let status: GameState['status'] = 'playing';
  let winner: GameState['winner'] = null;
  let finishReason: FinishReason | null = null;

  // ① 패자 별 0 → 즉시 종료
  if (result !== 'draw' && stars[opponentOf(result)] <= 0) {
    status = 'finished';
    winner = result;
    finishReason = 'stars_zero';
  }
  // ② 양쪽 카드 소진 → 별 비교 (동점이면 draw)
  if (status !== 'finished' && handTotal(state.players.A.hand) === 0 && handTotal(state.players.B.hand) === 0) {
    status = 'finished';
    finishReason = 'cards_exhausted';
    winner = stars.A > stars.B ? 'A' : stars.B > stars.A ? 'B' : 'draw';
  }

  const resolved: RoundRecord = {
    ...state.currentRound,
    choices: { A: choiceA, B: choiceB },
    result,
    resolvedAt: at.toISOString(),
  };
  const history = [...state.history, resolved];

  const nextState: GameState = {
    ...state,
    players: {
      A: { ...state.players.A, stars: stars.A },
      B: { ...state.players.B, stars: stars.B },
    },
    status,
    winner,
    finishReason,
    history,
    // 미종료면 다음 라운드로 전진, 종료면 해결된 라운드를 currentRound로 둔다
    roundNumber: status === 'finished' ? state.roundNumber : state.roundNumber + 1,
    currentRound: status === 'finished' ? resolved : newRound(state.roundNumber + 1),
  };

  const reveal: RevealPayload = {
    roundNumber: state.roundNumber,
    choices: { A: choiceA, B: choiceB },
    result,
    stars: { A: stars.A, B: stars.B },
    winner,
    finishReason,
  };
  return { state: nextState, reveal };
}

export function checkTimeout(state: GameState, now?: Date): GameState {
  if (state.status === 'finished') return { ...state };
  const at = now ?? new Date();
  if (at.getTime() < Date.parse(state.deadlineAt)) return { ...state };
  const winner: GameState['winner'] =
    state.players.A.stars > state.players.B.stars
      ? 'A'
      : state.players.B.stars > state.players.A.stars
        ? 'B'
        : 'draw';
  return { ...state, status: 'finished', winner, finishReason: 'timeout' };
}

/**
 * 기권 처리: 지정된 승자로 즉시 게임 종료.
 * 별/카드/라운드 상태는 전혀 변경하지 않는다 (이미 finished면 무변경 복사 반환).
 * 소켓 레이어의 재접속 유예 만료 시 사용 — 순수 함수, 입력 불변.
 */
export function forfeitGame(
  state: GameState,
  winner: PlayerSlot,
  now?: Date,
): GameState {
  void now; // 서명상 허용되지만 기록할 타임스탬프 필드가 없어 미사용
  if (state.status === 'finished') return { ...state };
  return { ...state, status: 'finished', winner, finishReason: 'forfeit' };
}

function lastRevealOf(state: GameState): RevealPayload | null {
  const last = state.history[state.history.length - 1];
  if (!last || !last.choices.A || !last.choices.B || !last.result) return null;
  // history에는 별이 기록되지 않으므로 결과 시퀀스를 리플레이해 해당 시점 별을 복원
  let a = INITIAL_STARS;
  let b = INITIAL_STARS;
  for (const r of state.history) {
    if (r.result === 'A') {
      a += 1;
      b -= 1;
    } else if (r.result === 'B') {
      b += 1;
      a -= 1;
    }
  }
  // 라운드 판정으로 끝난 게임(stars_zero/cards_exhausted)일 때만 승자 정보를 붙인다.
  // timeout/forfeit은 라운드와 무관하게 끝나므로 붙이지 않는다.
  const roundDecided =
    state.status === 'finished' &&
    (state.finishReason === 'stars_zero' || state.finishReason === 'cards_exhausted') &&
    last.roundNumber === state.roundNumber;
  return {
    roundNumber: last.roundNumber,
    choices: { A: last.choices.A, B: last.choices.B },
    result: last.result,
    stars: { A: a, B: b },
    winner: roundDecided ? state.winner : null,
    finishReason: roundDecided ? state.finishReason : null,
  };
}

export function toPublicView(
  state: GameState,
  me: PlayerSlot,
  opponentConnected: boolean,
): PublicGameView {
  const opp = opponentOf(me);
  const mePlayer = state.players[me];
  const oppPlayer = state.players[opp];
  return {
    roomCode: state.roomCode,
    roundNumber: state.roundNumber,
    roundId: state.currentRound.roundId,
    status: state.status,
    deadlineAt: state.deadlineAt,
    startedAt: state.startedAt,
    me: {
      slot: mePlayer.slot,
      nickname: mePlayer.nickname,
      hand: { ...mePlayer.hand },
      stars: mePlayer.stars,
      submitted: state.currentRound.submitted[me],
      choice: state.currentRound.choices[me],
    },
    // 마스킹: 상대에게는 종류별 잔량(hand)과 제출 카드(choice)를 절대 노출하지 않는다.
    opponent: {
      nickname: oppPlayer.nickname,
      stars: oppPlayer.stars,
      totalCards: handTotal(oppPlayer.hand),
      submitted: state.currentRound.submitted[opp],
      connected: opponentConnected,
    },
    lastReveal: lastRevealOf(state),
    winner: state.winner,
    finishReason: state.finishReason,
  };
}

export function handTotal(h: HandCounts): number {
  return h.rock + h.scissors + h.paper;
}

/** a 기준 승패: 'A' = a 승리, 'B' = b 승리, 'draw' = 무승부 */
export function beats(a: CardType, b: CardType): RoundResult {
  if (a === b) return 'draw';
  if (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  ) {
    return 'A';
  }
  return 'B';
}
