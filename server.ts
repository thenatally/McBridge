import net from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const MINECRAFT_SERVER_HOST = 'localhost';
const MINECRAFT_SERVER_PORT = 25565;
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

const connections = new Map();

const wss = new WebSocketServer({ port: 5006 });

class MinecraftSession {
  id: string;
  tcpSocket: net.Socket;
  buffer: Buffer[];
  bufferSize: number;
  activeWs: WebSocket | null;
  isClosing: boolean;
  lastActivity: number;

  constructor() {
    this.id = uuidv4();
    this.buffer = [];
    this.bufferSize = 0;
    this.activeWs = null;
    this.isClosing = false;
    this.lastActivity = Date.now();


    this.tcpSocket = net.connect(MINECRAFT_SERVER_PORT, MINECRAFT_SERVER_HOST, () => {
      console.log(`[${this.id}] Connected to Minecraft server`);
    });


    this.tcpSocket.on('data', (data) => {
      this.lastActivity = Date.now();
      this.sendToWebSocket(data);
    });


    this.tcpSocket.on('close', () => {
      console.log(`[${this.id}] TCP connection to Minecraft server closed`);
      this.cleanup();
    });


    this.tcpSocket.on('error', (err) => {
      console.error(`[${this.id}] TCP socket error:`, err);
      this.cleanup();
    });


    this.setupSessionTimeout();
  }


  attachWebSocket(ws: WebSocket) {

    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      this.activeWs.close();
    }

    this.activeWs = ws;
    this.lastActivity = Date.now();

    this.flushBuffer();

    return this;
  }


  sendToMinecraft(data: Buffer) {
    this.lastActivity = Date.now();
    this.tcpSocket.write(data);
  }


  sendToWebSocket(data: Buffer) {
    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      this.activeWs.send(data);
    } else {
      this.bufferMessage(data);
    }
  }


  bufferMessage(data: Buffer) {

    if (this.bufferSize + data.length > MAX_BUFFER_SIZE) {
      console.warn(`[${this.id}] Buffer size limit reached, dropping oldest messages`);


      while (this.buffer.length > 0 && this.bufferSize + data.length > MAX_BUFFER_SIZE) {
        const removed = this.buffer.shift();
        if (removed) {
          this.bufferSize -= removed.length;
        }
      }
    }


    this.buffer.push(data);
    this.bufferSize += data.length;
    console.log(`[${this.id}] Message buffered. Buffer size: ${this.buffer.length} messages (${this.bufferSize} bytes)`);
  }


  flushBuffer() {
    if (this.buffer.length === 0) return;

    console.log(`[${this.id}] Flushing buffer: ${this.buffer.length} messages (${this.bufferSize} bytes)`);

    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {

      for (const data of this.buffer) {
        this.activeWs.send(data);
      }


      this.buffer = [];
      this.bufferSize = 0;
    }
  }


  setupSessionTimeout() {
    const checkInterval = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivity;

      if (inactiveTime > 15 * 60 * 1000) {
        console.log(`[${this.id}] Session timed out due to inactivity`);
        clearInterval(checkInterval);
        this.cleanup();
      }
    }, 60 * 1000);


    this.tcpSocket.on('close', () => {
      clearInterval(checkInterval);
    });
  }


  cleanup() {
    if (this.isClosing) return;

    this.isClosing = true;
    console.log(`[${this.id}] Cleaning up session`);

    if (this.activeWs && this.activeWs.readyState === WebSocket.OPEN) {
      this.activeWs.close();
    }

    if (!this.tcpSocket.destroyed) {
      this.tcpSocket.destroy();
    }

    connections.delete(this.id);
  }


  detachWebSocket() {
    this.activeWs = null;
    console.log(`[${this.id}] WebSocket detached, keeping TCP connection alive`);



    setTimeout(() => {
      if (!this.activeWs && connections.has(this.id)) {
        console.log(`[${this.id}] No WebSocket reconnection, closing session`);
        this.cleanup();
      }
    }, 5 * 60 * 1000);
  }
}


wss.on('connection', (ws, req) => {
  const connectionId = req.url?.slice(1) || uuidv4();
  console.log(`WebSocket client connected with ID: ${connectionId}`);

  let session: MinecraftSession;


  if (connections.has(connectionId)) {
    console.log(`Reconnection detected for session ${connectionId}`);
    session = connections.get(connectionId);
    session.attachWebSocket(ws);
  } else {

    session = new MinecraftSession();
    session.attachWebSocket(ws);
    connections.set(session.id, session);


    ws.send(Buffer.from(JSON.stringify({ type: 'session', id: session.id })));
  }


  ws.on('message', (msg) => {
    session.lastActivity = Date.now();
    session.sendToMinecraft(msg as Buffer);
  });


  ws.on('close', () => {
    console.log(`WebSocket closed for session ${session.id}`);
    session.detachWebSocket();
  });


  ws.on('error', (err) => {
    console.error(`WebSocket error for session ${session.id}:`, err);
    session.detachWebSocket();
  });
});

console.log('Server listening on port 5006');


process.on('SIGINT', () => {
  console.log('Shutting down server gracefully...');


  connections.forEach((session) => {
    session.cleanup();
  });


  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});