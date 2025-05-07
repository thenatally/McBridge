import net from 'net';
import WebSocket from 'ws';
const WS_SERVER_URL = 'wss://mcbridge.tally.gay';

const tcpServer = net.createServer((tcpSocket) => {
  console.log('Client connected');
  let reconnectToken: string | null = null;
  let tcpBuffer: Buffer[] = [];
  let ws: WebSocket | null = null;

  const connectWebSocket = () => {
    ws = new WebSocket(WS_SERVER_URL);

    ws.on('open', () => {
      console.log('WebSocket connection established');
      if (reconnectToken) {
        ws?.send(JSON.stringify({ type: 'reconnect', token: reconnectToken }));
      }

      tcpSocket.on('data', (data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(data);
        } else {
          tcpBuffer.push(data);
        }
      });

      ws?.on('message', (msg) => {
        const message = JSON.parse(msg.toString());
        if (message.type === 'uuid') {
          reconnectToken = message.token;
        } else if (message.type === 'data') {
          tcpSocket.write(Buffer.from(message.data));
        }
      });

      while (tcpBuffer.length > 0) {
        ws?.send(tcpBuffer.shift()!);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket disconnected, attempting to reconnect...');
      setTimeout(connectWebSocket, 10);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      ws?.close();
    });
  };

  connectWebSocket();

  const cleanup = () => {
    tcpSocket.destroy();
    ws?.close();
  };

  tcpSocket.on('close', cleanup);
  tcpSocket.on('error', cleanup);
});

tcpServer.listen(9999, () => {
  console.log('TLink v2');
});