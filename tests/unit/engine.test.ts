// 게임 엔진 단위 테스트 — 명세서 §12 시나리오 1,2,3,4,8 + 마스킹
// 실행: npx vitest run tests/unit/engine.test.ts

import { describe, expect, it } from 'vitest';
import {
  GameError,
  beats,
  bothSubmitted,
  checkTimeout,
  createGame,
  handTotal,
  resolveRound,
  submitCard,
  toPublicView,
} from '../../src/game/engine';
import type { CardType, GameState } from '../../src/shared/types';
import { GAME_TIMEOUT_MS, INITIAL_STARS } from '../../src/shared/types';

/** 한 라운드 진행 헬퍼: 양쪽 제출 → resolve, { state, reveal } 반환 */
function playRound(state: GameState, a: CardType, b: CardType) {
  const roundId = state.currentRound.roundId;
  const s1 = submitCard(state, 'A', a, roundId);
  const s2 = submitCard(s1, 'B', b, roundId);
  return resolveRound(s2);
}

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError(${code}) but nothing was thrown`);
}

describe('createGame', () => {
  it('초기 상태: 각자 바위/가위/보 4장, 별 3개, deadline = startedAt + 4시간', () => {
    const now = new Date('2026-10-15T10:00:00.000Z');
    const s = createGame('123456', '철수', '영희', now);
    expect(s.roomCode).toBe('123456');
    expect(s.status).toBe('playing');
    expect(s.roundNumber).toBe(1);
    expect(s.players.A.nickname).toBe('철수');
    expect(s.players.B.nickname).toBe('영희');
    expect(s.players.A.hand).toEqual({ rock: 4, scissors: 4, paper: 4 });
    expect(s.players.B.hand).toEqual({ rock: 4, scissors: 4, paper: 4 });
    expect(s.players.A.stars).toBe(INITIAL_STARS);
    expect(s.players.B.stars).toBe(INITIAL_STARS);
    expect(s.winner).toBeNull();
    expect(s.finishReason).toBeNull();
    expect(s.history).toEqual([]);
    expect(s.startedAt).toBe(now.toISOString());
    expect(Date.parse(s.deadlineAt) - Date.parse(s.startedAt)).toBe(GAME_TIMEOUT_MS);
    expect(s.currentRound.roundId).toBeTruthy();
    expect(s.gameId).not.toBe(s.currentRound.roundId);
  });

  it('게임끼리 hand 객체를 공유하지 않는다', () => {
    const s1 = createGame('1', 'a', 'b');
    const s2 = createGame('2', 'a', 'b');
    const r = playRound(s1, 'rock', 'scissors');
    expect(r.state.players.A.hand.rock).toBe(3);
    expect(s2.players.A.hand.rock).toBe(4);
  });
});

describe('beats / handTotal', () => {
  it('가위바위보 판정 (a 기준)', () => {
    expect(beats('rock', 'scissors')).toBe('A');
    expect(beats('scissors', 'paper')).toBe('A');
    expect(beats('paper', 'rock')).toBe('A');
    expect(beats('scissors', 'rock')).toBe('B');
    expect(beats('paper', 'scissors')).toBe('B');
    expect(beats('rock', 'paper')).toBe('B');
    expect(beats('rock', 'rock')).toBe('draw');
    expect(beats('scissors', 'scissors')).toBe('draw');
    expect(beats('paper', 'paper')).toBe('draw');
  });

  it('handTotal', () => {
    expect(handTotal({ rock: 4, scissors: 4, paper: 4 })).toBe(12);
    expect(handTotal({ rock: 0, scissors: 1, paper: 2 })).toBe(3);
  });
});

describe('submitCard', () => {
  it('성공 시 새 state 반환, 원본 불변', () => {
    const s = createGame('1', 'a', 'b');
    const before = JSON.stringify(s);
    const rid = s.currentRound.roundId;
    const n = submitCard(s, 'A', 'rock', rid);
    expect(JSON.stringify(s)).toBe(before); // 원본 변경 금지
    expect(n).not.toBe(s);
    expect(n.players.A.hand.rock).toBe(3);
    expect(n.currentRound.choices.A).toBe('rock');
    expect(n.currentRound.submitted.A).toBe(true);
    expect(n.currentRound.submitted.B).toBe(false);
    expect(bothSubmitted(n)).toBe(false);
  });

  it('양쪽 제출 시 bothSubmitted=true', () => {
    const s = createGame('1', 'a', 'b');
    const rid = s.currentRound.roundId;
    const n = submitCard(submitCard(s, 'A', 'rock', rid), 'B', 'paper', rid);
    expect(bothSubmitted(n)).toBe(true);
  });
});

describe('§12 시나리오 1: 12라운드 완주 → 별 비교 판정', () => {
  // NOTE: 게임 수학상 12라운드를 완주하면 별은 항상 동점(3-3)이 된다.
  // (a승−b승)이 3의 배수가 아니면 카드 분배(종류별 4장)를 만족할 수 없음 — 증명은 구현 노트 참조.
  // 명세 예시 "7승5패 → A 5별"은 도달 불가능하므로, 가능한 최대로 치열한 6승6패 시나리오로 검증한다.
  const rounds: Array<[CardType, CardType]> = [
    ['rock', 'scissors'], // A승
    ['scissors', 'rock'], // B승
    ['scissors', 'paper'], // A승
    ['paper', 'scissors'], // B승
    ['paper', 'rock'], // A승
    ['rock', 'paper'], // B승
    ['rock', 'scissors'], // A승
    ['scissors', 'rock'], // B승
    ['scissors', 'paper'], // A승
    ['paper', 'scissors'], // B승
    ['paper', 'rock'], // A승
    ['rock', 'paper'], // B승
  ];

  it('12라운드 완주 → cards_exhausted, 별 비교 동점 draw', () => {
    let s = createGame('111111', '갑', '을');
    rounds.forEach(([a, b], i) => {
      const { state, reveal } = playRound(s, a, b);
      // 별 총합 불변 (모든 라운드 후 A+B=6)
      expect(state.players.A.stars + state.players.B.stars).toBe(6);
      // reveal 정합성
      expect(reveal.roundNumber).toBe(i + 1);
      expect(reveal.choices).toEqual({ A: a, B: b });
      expect(reveal.result).toBe(beats(a, b));
      expect(reveal.stars).toEqual({ A: state.players.A.stars, B: state.players.B.stars });
      s = state;
    });
    expect(s.status).toBe('finished');
    expect(s.finishReason).toBe('cards_exhausted');
    expect(s.winner).toBe('draw');
    expect(s.players.A.stars).toBe(3);
    expect(s.players.B.stars).toBe(3);
    expect(s.history).toHaveLength(12);
    expect(handTotal(s.players.A.hand)).toBe(0);
    expect(handTotal(s.players.B.hand)).toBe(0);
    // 라운드마다 새 roundId 발급
    const ids = new Set(s.history.map((h) => h.roundId));
    expect(ids.size).toBe(12);
  });
});

describe('§12 시나리오 2: 3연승 즉시 승리', () => {
  it('B 별 0 → 남은 카드가 있어도 finished/stars_zero, winner A', () => {
    let s = createGame('222222', '갑', '을');
    for (let i = 0; i < 3; i++) {
      s = playRound(s, 'rock', 'scissors').state;
    }
    expect(s.status).toBe('finished');
    expect(s.finishReason).toBe('stars_zero');
    expect(s.winner).toBe('A');
    expect(s.players.A.stars).toBe(6);
    expect(s.players.B.stars).toBe(0);
    expect(s.history).toHaveLength(3);
    // 남은 카드가 있어도 종료
    expect(handTotal(s.players.A.hand)).toBe(9);
    expect(handTotal(s.players.B.hand)).toBe(9);
  });
});

describe('§12 시나리오 3: 12라운드 전부 무승부', () => {
  it('별 변동 없이 3-3, winner draw', () => {
    let s = createGame('333333', '갑', '을');
    const draws: CardType[] = ['rock', 'rock', 'rock', 'rock', 'scissors', 'scissors', 'scissors', 'scissors', 'paper', 'paper', 'paper', 'paper'];
    draws.forEach((c) => {
      const before = { A: s.players.A.stars, B: s.players.B.stars };
      const { state, reveal } = playRound(s, c, c);
      expect(reveal.result).toBe('draw');
      // 무승부 시 별 변동 없음
      expect(state.players.A.stars).toBe(before.A);
      expect(state.players.B.stars).toBe(before.B);
      s = state;
    });
    expect(s.status).toBe('finished');
    expect(s.finishReason).toBe('cards_exhausted');
    expect(s.winner).toBe('draw');
    expect(s.players.A.stars).toBe(3);
    expect(s.players.B.stars).toBe(3);
  });
});

describe('§12 시나리오 4: 중복 제출', () => {
  it('같은 라운드 두 번째 제출 → ALREADY_SUBMITTED, 카드 1장만 소모', () => {
    const s = createGame('444444', '갑', '을');
    const rid = s.currentRound.roundId;
    const once = submitCard(s, 'A', 'rock', rid);
    expectGameError(() => submitCard(once, 'A', 'scissors', rid), 'ALREADY_SUBMITTED');
    expectGameError(() => submitCard(once, 'A', 'rock', rid), 'ALREADY_SUBMITTED');
    // 카드 1장만 소모, 제출 상태 유지
    expect(once.players.A.hand.rock).toBe(3);
    expect(handTotal(once.players.A.hand)).toBe(11);
    expect(once.currentRound.choices.A).toBe('rock');
    expect(once.currentRound.submitted.A).toBe(true);
  });
});

describe('§12 시나리오 5(엔진 부분): 비공개 마스킹', () => {
  it('상대 시점 view에 상대 hand 종류별 잔량·제출 카드가 없음 (JSON 직렬화 후에도)', () => {
    let s = createGame('555555', '갑', '을');
    const rid = s.currentRound.roundId;
    s = submitCard(s, 'A', 'rock', rid);
    s = submitCard(s, 'B', 'paper', rid); // 양쪽 제출, 아직 resolve 전

    const viewB = toPublicView(s, 'B', true);
    // opponent 객체 키는 정확히 5개만
    expect(Object.keys(viewB.opponent).sort()).toEqual(
      ['connected', 'nickname', 'stars', 'submitted', 'totalCards'].sort(),
    );
    expect(viewB.opponent.submitted).toBe(true);
    expect(viewB.opponent.totalCards).toBe(11);
    // JSON 직렬화 → 파싱 후에도 hand/choice 키가 존재하지 않음
    const reparsed = JSON.parse(JSON.stringify(viewB)) as typeof viewB;
    expect('hand' in reparsed.opponent).toBe(false);
    expect('choice' in reparsed.opponent).toBe(false);
    expect(JSON.stringify(reparsed.opponent)).not.toContain('rock');

    // 내 시점에는 내 hand와 choice가 보임
    const viewA = toPublicView(s, 'A', true);
    expect(viewA.me.hand).toEqual({ rock: 3, scissors: 4, paper: 4 });
    expect(viewA.me.choice).toBe('rock');
    expect(viewA.me.submitted).toBe(true);
    expect('hand' in (viewA.opponent as object)).toBe(false);
  });

  it('제출 전에는 상대 submitted=false, choice 노출 없음', () => {
    const s = createGame('555556', '갑', '을');
    const view = toPublicView(s, 'A', false);
    expect(view.opponent.submitted).toBe(false);
    expect(view.opponent.connected).toBe(false);
    expect(Object.keys(view.opponent)).not.toContain('hand');
  });
});

describe('§12 시나리오 8: 서버 권한 검증', () => {
  it('미보유 카드 제출 → NO_SUCH_CARD', () => {
    let s = createGame('888888', '갑', '을');
    // 바위 4장을 4라운드에 걸쳐 소진
    for (let i = 0; i < 4; i++) {
      s = playRound(s, 'rock', 'rock').state;
    }
    expect(s.players.A.hand.rock).toBe(0);
    expect(s.status).toBe('playing');
    expectGameError(() => submitCard(s, 'A', 'rock', s.currentRound.roundId), 'NO_SUCH_CARD');
  });

  it('종료 후 제출 → NOT_PLAYING', () => {
    let s = createGame('888889', '갑', '을');
    for (let i = 0; i < 3; i++) s = playRound(s, 'rock', 'scissors').state;
    expect(s.status).toBe('finished');
    expectGameError(() => submitCard(s, 'A', 'paper', s.currentRound.roundId), 'NOT_PLAYING');
    expectGameError(() => submitCard(s, 'B', 'paper', s.currentRound.roundId), 'NOT_PLAYING');
  });

  it('잘못된 roundId → ROUND_MISMATCH', () => {
    const s = createGame('888890', '갑', '을');
    expectGameError(() => submitCard(s, 'A', 'rock', 'wrong-round-id'), 'ROUND_MISMATCH');
    // 검증 순서: NOT_PLAYING이 ROUND_MISMATCH보다 우선
    let f = createGame('888891', '갑', '을');
    for (let i = 0; i < 3; i++) f = playRound(f, 'rock', 'scissors').state;
    expectGameError(() => submitCard(f, 'A', 'rock', 'wrong-round-id'), 'NOT_PLAYING');
  });
});

describe('resolveRound / checkTimeout', () => {
  it('양쪽 미제출 시 resolveRound throw', () => {
    const s = createGame('999991', '갑', '을');
    expect(() => resolveRound(s)).toThrow();
    const rid = s.currentRound.roundId;
    const half = submitCard(s, 'A', 'rock', rid);
    expect(() => resolveRound(half)).toThrow();
  });

  it('resolve 후 라운드 전진 + 새 roundId', () => {
    const s = createGame('999992', '갑', '을');
    const { state } = playRound(s, 'rock', 'scissors');
    expect(state.roundNumber).toBe(2);
    expect(state.currentRound.roundId).not.toBe(s.currentRound.roundId);
    expect(state.currentRound.submitted).toEqual({ A: false, B: false });
    expect(state.currentRound.choices).toEqual({ A: null, B: null });
    expect(state.history).toHaveLength(1);
    expect(state.history[0].result).toBe('A');
  });

  it('reveal과 lastReveal 정합성', () => {
    const s = createGame('999993', '갑', '을');
    const { state, reveal } = playRound(s, 'rock', 'scissors');
    expect(reveal).toEqual({
      roundNumber: 1,
      choices: { A: 'rock', B: 'scissors' },
      result: 'A',
      stars: { A: 4, B: 2 },
      winner: null,
      finishReason: null,
    });
    const view = toPublicView(state, 'A', true);
    expect(view.lastReveal).toEqual(reveal);
  });

  it('deadline 경과 → timeout 종료 (동점이면 draw)', () => {
    const start = new Date('2026-10-15T10:00:00.000Z');
    const s = createGame('999994', '갑', '을', start);
    const before = checkTimeout(s, new Date('2026-10-15T13:59:59.000Z'));
    expect(before.status).toBe('playing');
    const after = checkTimeout(s, new Date('2026-10-15T14:00:01.000Z'));
    expect(after.status).toBe('finished');
    expect(after.finishReason).toBe('timeout');
    expect(after.winner).toBe('draw'); // 3-3 동점
  });

  it('deadline 경과 시 별 우위자가 winner', () => {
    const start = new Date('2026-10-15T10:00:00.000Z');
    let s = createGame('999995', '갑', '을', start);
    s = playRound(s, 'rock', 'scissors').state; // 4-2
    const after = checkTimeout(s, new Date(start.getTime() + GAME_TIMEOUT_MS + 1000));
    expect(after.status).toBe('finished');
    expect(after.finishReason).toBe('timeout');
    expect(after.winner).toBe('A');
  });

  it('이미 종료된 게임에 checkTimeout은 무변경', () => {
    let s = createGame('999996', '갑', '을');
    for (let i = 0; i < 3; i++) s = playRound(s, 'rock', 'scissors').state;
    const after = checkTimeout(s, new Date(Date.parse(s.deadlineAt) + 999999));
    expect(after.status).toBe('finished');
    expect(after.finishReason).toBe('stars_zero');
    expect(after.winner).toBe('A');
  });
});
