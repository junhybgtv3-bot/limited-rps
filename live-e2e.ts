import { io, type Socket } from 'socket.io-client';

const URL = 'https://limited-rps-jj0r.onrender.com';
const TIMEOUT = 30000;

function emitAck(socket: Socket, event: string, payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${event}`)), TIMEOUT);
    socket.emit(event, payload, (res: any) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function once(socket: Socket, event: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting: ${event}`)), TIMEOUT);
    socket.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function main() {
  const a = io(URL, { transports: ['websocket'] });
  const b = io(URL, { transports: ['websocket'] });
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);
  console.log('1. 소켓 연결 OK (2 clients)');

  const created: any = await emitAck(a, 'room:create', { nickname: '테스터A' });
  if (!created.ok) throw new Error('room:create failed: ' + JSON.stringify(created));
  const code = created.roomCode;
  console.log(`2. 방 생성 OK — 코드: ${code}`);

  const joined: any = await emitAck(b, 'room:join', { roomCode: code, nickname: '테스터B' });
  if (!joined.ok) throw new Error('room:join failed: ' + JSON.stringify(joined));
  console.log('3. 방 참가 OK');

  const startA = once(a, 'game:start');
  const startB = once(b, 'game:start');
  a.emit('lobby:ready', {});
  b.emit('lobby:ready', {});
  const [gsA, gsB] = await Promise.all([startA, startB]);
  console.log('4. 준비 완료 → 게임 시작 OK');
  let roundId: string = gsA.roundId ?? gsA.game?.currentRound?.roundId;
  if (!roundId) {
    // game:start 페이로드에서 roundId 추출 실패 시 game:update 대기
    const upd: any = await once(a, 'game:update');
    roundId = upd.roundId ?? upd.game?.currentRound?.roundId;
  }
  console.log('   첫 라운드 ID:', roundId?.slice(0, 8) + '...');

  // A는 항상 바위, B는 항상 가위 → A가 3연승하면 stars_zero 종료
  let rounds = 0;
  let finished: any = null;
  const finA = once(a, 'game:finish').then((d) => { finished = d; });
  const finB = once(b, 'game:finish');
  while (!finished && rounds < 12) {
    rounds++;
    const updP = once(a, 'game:update');
    const revP = once(a, 'game:reveal');
    const r1: any = await emitAck(a, 'game:submit', { roundId, card: 'rock' });
    const r2: any = await emitAck(b, 'game:submit', { roundId, card: 'scissors' });
    if (!r1.ok || !r2.ok) throw new Error(`submit failed r${rounds}: ${JSON.stringify(r1)} ${JSON.stringify(r2)}`);
    const reveal: any = await revP;
    await updP.catch(() => null);
    const stars = reveal.stars ?? reveal.game?.stars;
    console.log(`   라운드 ${rounds}: A(바위) vs B(가위) → 승자 ${reveal.result}, 별 A=${stars?.A} B=${stars?.B}`);
    if (finished) break;
    // 다음 라운드 ID: reveal 또는 game:update에서 추출
    await new Promise((r) => setTimeout(r, 300));
    const upd2: any = await once(a, 'game:update').catch(() => null);
    roundId = reveal.nextRoundId ?? upd2?.roundId ?? upd2?.game?.currentRound?.roundId;
    if (!roundId) break;
  }
  await Promise.race([finA, finB, new Promise((r) => setTimeout(r, 5000))]);
  console.log('5. 게임 종료:', JSON.stringify(finished ?? { note: 'finish 이벤트 미수신' }));
  const pass = finished && finished.winner === 'A' && /stars_zero/.test(JSON.stringify(finished));
  console.log(pass ? '✅ LIVE E2E PASS — 3연승 stars_zero 즉시 종료 정상' : '❌ LIVE E2E FAIL');
  a.close();
  b.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error('❌ LIVE E2E ERROR:', e.message);
  process.exit(1);
});
