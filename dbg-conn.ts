import { io } from 'socket.io-client';
const s = io('https://limited-rps-jj0r.onrender.com', { transports: ['polling', 'websocket'], timeout: 20000 });
s.on('connect', () => { console.log('CONNECTED', s.id); s.close(); process.exit(0); });
s.on('connect_error', (e) => { console.log('CONNECT_ERROR:', e.message); });
setTimeout(() => { console.log('TIMEOUT, state:', (s as any).connected); process.exit(1); }, 25000);
