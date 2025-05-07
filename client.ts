
import net from 'net';
import WebSocket from 'ws';
const WS_SERVER_URL = 'wss://mcbridge.tally.gay';
const tcpServer = net.createServer((tcpSocket) => {
  console.log('Client connected');
  const ws = new WebSocket(WS_SERVER_URL);

  ws.on('open', () => {
    console.log('WebSocket connection established');
    tcpSocket.on('data', (data) => {
      ws.send(data);
    });
    ws.on('message', (msg) => {
      tcpSocket.write(msg as Buffer);
    });
  });

  const cleanup = () => {
    tcpSocket.destroy();
    ws.close();
  };

  tcpSocket.on('close', cleanup);
  tcpSocket.on('error', cleanup);
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

tcpServer.listen(9999, () => {
  console.log('Client listening on port 9999');
});