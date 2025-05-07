import net from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { parse } from 'url';

const MINECRAFT_SERVER_HOST = 'localhost';
const MINECRAFT_SERVER_PORT = 25565;
const wss = new WebSocketServer({ port: 8080 });

interface Session {
  token: string;
  tcpSocket: net.Socket;
  ws?: WebSocket;
  buffer: Buffer[];
}
const sessions = new Map<string, Session>();

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url || '', true);
  let token = typeof query.token === 'string' ? query.token : undefined;
  let session: Session;

  if (token && sessions.has(token)) {
    session = sessions.get(token)!;
    session.ws = ws;
    session.buffer.forEach((pkt) => ws.send(pkt));
    session.buffer = [];
    console.log(`Reconnected session ${token}`);
  } else {
    token = uuidv4();
    const tcpSocket = net.connect(
      MINECRAFT_SERVER_PORT,
      MINECRAFT_SERVER_HOST,
      () => console.log('Connected to Minecraft server')
    );
    session = { token, tcpSocket, ws, buffer: [] };
    sessions.set(token, session);
    ws.send(JSON.stringify({ type: 'token', token }));
    tcpSocket.on('data', (data) => {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(data);
      } else {
        session.buffer.push(data);
      }
    });
    console.log(`New session ${token}`);
  }

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === 'token') return;
    } catch {}
    session.tcpSocket.write(msg as Buffer);
  });

  const cleanup = () => {
    console.log(`Cleaning up session ${session.token}`);
    if (session.ws === ws) {
      session.ws = undefined;
    }
    if (!session.ws) {
      console.log(`Session ${session.token} awaiting reconnect`);
    }
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

console.log('Server listening on port 8080');

