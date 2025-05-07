import net from 'net';
import WebSocket from 'ws';

const WS_SERVER_URL = 'wss://mcbridge.tally.gay';

const RECONNECT_INTERVAL = 2000; 
const MAX_RETRIES = 10; 
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; 


let sessionId: string | null = null;

class BufferedWebSocket {
  private ws: WebSocket | null = null;
  private buffer: Buffer[] = [];
  private bufferSize = 0;
  private retryCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private tcpSocket: net.Socket;
  private connected = false;
  private sessionId: string | null = null;

  constructor(tcpSocket: net.Socket) {
    this.tcpSocket = tcpSocket;
    this.connect();
  }

  private connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    
    const wsUrl = this.sessionId ? `${WS_SERVER_URL}/${this.sessionId}` : WS_SERVER_URL;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.on('open', () => {
      console.log('WebSocket connection established');
      this.connected = true;
      this.retryCount = 0;
      
      
      this.flushBuffer();
    });

    this.ws.on('message', (msg) => {
      try {
        
        const strMsg = msg.toString();
        if (strMsg.startsWith('{') && strMsg.includes('"type":"session"')) {
          const sessionData = JSON.parse(strMsg);
          if (sessionData.type === 'session' && sessionData.id) {
            this.sessionId = sessionData.id;
            console.log(`Received session ID: ${this.sessionId}`);
            return; 
          }
        }
      } catch (e) {
        
      }
      
      
      this.tcpSocket.write(msg as Buffer);
    });

    this.ws.on('close', () => {
      this.handleDisconnect('WebSocket closed');
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      this.handleDisconnect('WebSocket error');
    });
  }

  private handleDisconnect(reason: string) {
    console.log(`Disconnected: ${reason}. Attempting to reconnect...`);
    this.connected = false;
    
    if (this.retryCount >= MAX_RETRIES) {
      console.error(`Failed to reconnect after ${MAX_RETRIES} attempts`);
      this.tcpSocket.destroy(new Error('Failed to reconnect to WebSocket server'));
      return;
    }
    
    this.retryCount++;
    
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    
    const delay = RECONNECT_INTERVAL * Math.pow(1.5, this.retryCount - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.retryCount}/${MAX_RETRIES})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public send(data: Buffer) {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      
      this.ws.send(data);
    } else {
      
      this.bufferMessage(data);
    }
  }

  private bufferMessage(data: Buffer) {
    
    if (this.bufferSize + data.length > MAX_BUFFER_SIZE) {
      console.warn('Buffer size limit reached, dropping oldest messages');
      
      
      while (this.buffer.length > 0 && this.bufferSize + data.length > MAX_BUFFER_SIZE) {
        const removed = this.buffer.shift();
        if (removed) {
          this.bufferSize -= removed.length;
        }
      }
    }
    
    
    this.buffer.push(data);
    this.bufferSize += data.length;
    console.log(`Message buffered. Buffer size: ${this.buffer.length} messages (${this.bufferSize} bytes)`);
  }

  private flushBuffer() {
    if (this.buffer.length === 0) return;
    
    console.log(`Flushing buffer: ${this.buffer.length} messages (${this.bufferSize} bytes)`);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      
      for (const data of this.buffer) {
        this.ws.send(data);
      }
      
      
      this.buffer = [];
      this.bufferSize = 0;
    }
  }

  public close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.ws) {
      this.ws.close();
    }
  }
}

const tcpServer = net.createServer((tcpSocket) => {
  console.log('Client connected');
  
  
  const bufferedWs = new BufferedWebSocket(tcpSocket);
  
  
  tcpSocket.on('data', (data) => {
    bufferedWs.send(data);
  });
  
  
  tcpSocket.on('close', () => {
    console.log('TCP client disconnected');
    bufferedWs.close();
  });
  
  tcpSocket.on('error', (err) => {
    console.error('TCP socket error:', err);
    bufferedWs.close();
  });
});


tcpServer.listen(9999, () => {
  console.log('Client listening on port 9999');
});


tcpServer.on('error', (err) => {
  console.error('TCP server error:', err);
});


process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  tcpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});