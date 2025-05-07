
import net from 'net';
import { WebSocketServer } from 'ws';

const MINECRAFT_SERVER_HOST = 'localhost';
const MINECRAFT_SERVER_PORT = 25565;

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  const tcpSocket = net.connect(MINECRAFT_SERVER_PORT, MINECRAFT_SERVER_HOST, () => {
    console.log('Connected to Minecraft server');
  });
  ws.on('message', (msg) => {
    tcpSocket.write(msg as Buffer);
  });
  tcpSocket.on('data', (data) => {
    ws.send(data);
  });
  const cleanup = () => {
    tcpSocket.destroy();
    ws.close();
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
  tcpSocket.on('close', cleanup);
  tcpSocket.on('error', cleanup);
});

console.log('Server listening on port 8080');

