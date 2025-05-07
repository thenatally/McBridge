import net from 'net';
import WebSocket from 'ws';

const WS_SERVER_URL = 'wss://mcbridge.tally.gay';
const RECONNECT_INTERVAL = 50; 

const tcpServer = net.createServer((tcpSocket) => {
  let ws: WebSocket;
  let reconnectToken: string | undefined;
  const buffer: Buffer[] = [];
  let reconnectTimeout: NodeJS.Timeout;

  function connect() {
    const url = reconnectToken
      ? `${WS_SERVER_URL}?token=${reconnectToken}`
      : WS_SERVER_URL;
    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log('WebSocket connection established');
      buffer.forEach((pkt) => ws.send(pkt));
      buffer.length = 0;
      tcpSocket.on('data', onTcpData);
      ws.on('message', (msg) => tcpSocket.write(msg as Buffer));
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'token') {
          reconnectToken = parsed.token;
          console.log(`Received reconnect token: ${reconnectToken}`);
          return;
        }
      } catch {}
      tcpSocket.write(data as Buffer);
    });

    const cleanupWs = () => {
      console.log('WebSocket disconnected, buffering tcp data');
      tcpSocket.off('data', onTcpData);
      reconnectTimeout = setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.on('close', cleanupWs);
    ws.on('error', cleanupWs);
  }

  function onTcpData(data: Buffer) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    } else {
      buffer.push(data);
    }
  }

  const cleanupAll = () => {
    clearTimeout(reconnectTimeout);
    tcpSocket.destroy();
    ws.close();
  };

  tcpSocket.on('close', cleanupAll);
  tcpSocket.on('error', cleanupAll);

  connect();
});

tcpServer.listen(9999, () => {
  console.log('Client listening on port 9999');
});
