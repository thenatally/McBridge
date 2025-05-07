import net from 'net';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const MINECRAFT_SERVER_HOST = 'localhost';
const MINECRAFT_SERVER_PORT = 25565;

const wss = new WebSocketServer({ port: 8080 });
const clientMap = new Map<string, { ws: any; tcpSocket: net.Socket; buffer: Buffer[] }>();

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  const clientId = uuidv4();
  let tcpSocket: net.Socket | null = null;
  const tcpBuffer: Buffer[] = [];

  const setupTcpSocket = () => {
    tcpSocket = net.connect(MINECRAFT_SERVER_PORT, MINECRAFT_SERVER_HOST, () => {
      console.log('Connected to Minecraft server');
    });

    tcpSocket.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') }));
      } else {
        tcpBuffer.push(data);
      }
    });

    tcpSocket.on('close', cleanup);
    tcpSocket.on('error', cleanup);
  };

  ws.on('message', (msg) => {
    const message = JSON.parse(msg.toString());
    if (message.type === 'reconnect' && clientMap.has(message.token)) {
      console.log('Reconnecting WebSocket client');
      const client = clientMap.get(message.token)!;
      client.ws = ws;
      client.buffer.forEach((data) => ws.send(JSON.stringify({ type: 'data', data: data.toString('base64') })));
      client.buffer.length = 0;
    } else if (message.type === 'data') {
      tcpSocket?.write(Buffer.from(message.data, 'base64'));
    }
  });

  ws.send(JSON.stringify({ type: 'uuid', token: clientId }));
  clientMap.set(clientId, { ws, tcpSocket: tcpSocket!, buffer: tcpBuffer });

  const cleanup = () => {
    tcpSocket?.destroy();
    clientMap.delete(clientId);
    ws.close();
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);

  setupTcpSocket();
});

console.log('Server listening on port 8080');

