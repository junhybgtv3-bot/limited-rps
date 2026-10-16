import { createServer } from 'node:http';
import express from 'express';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { attachSockets } from './sockets.js';

const dev = process.env.NODE_ENV !== 'production';

/**
 * 커스텀 서버 시작: express + Next.js(App Router) + Socket.IO.
 * integration 테스트에서 `startServer(0)` (랜덤 포트)로 기동 가능하다.
 */
export async function startServer(port: number): Promise<{
  httpServer: ReturnType<typeof createServer>;
  io: SocketIOServer;
}> {
  const nextApp = next({ dev, dir: process.cwd() });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  const expressApp = express();
  expressApp.use((req, res) => {
    void handle(req, res);
  });

  const httpServer = createServer(expressApp);
  const io = new SocketIOServer(httpServer);

  attachSockets(io);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      resolve();
    });
  });

  return { httpServer, io };
}
