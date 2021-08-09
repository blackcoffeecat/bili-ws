import BaseSocket from '../BaseSocket';

class BiliWS extends BaseSocket {
  private ws: WebSocket | null = null;

  connect(): void {
    this.close();

    const { host, wss_port: port } = this.host;

    const ws = new WebSocket(`wss://${host}:${port}/sub`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onerror = () => {
      if (ws === this.ws) this.close();
    };

    this.createConn((onOpen, onClose, handleMessage) => {
      ws.onopen = onOpen;
      ws.onclose = onClose;
      const onMessage = handleMessage((head, data) => {
        this.emit(data.cmd || head.op, data);
      });
      ws.onmessage = event => {
        onMessage(event.data);
      };
    });
  }

  send(data: ArrayBufferLike): void {
    this.ws?.send(data);
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default BiliWS;
