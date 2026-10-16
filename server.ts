// Next.js 커스텀 서버 진입점. tsx로 실행되므로 .js 확장자 import 사용.
import { startServer } from './src/server/start.js';

const port = Number(process.env.PORT) || 3000;

startServer(port)
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`> Ready on http://localhost:${port}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
