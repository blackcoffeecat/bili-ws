import BaseSocket from '../BaseSocket';

class BiliWS extends BaseSocket {
  private ws: WebSocket | null = null;

  connect() {
    this.close();

    const { host, wss_port: port } = this.host;

    const ws = new WebSocket(`wss://${host}:${port}/sub`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    this.createConn((onOpen, onClose, handleMessage) => {
      ws.onopen = onOpen;
      ws.onclose = onClose;
      const onMessage = handleMessage((cmd, data) => {
        this.emit(cmd, data);
      });
      ws.onmessage = event => {
        onMessage(event.data);
      };
    });
  }

  send(data: ArrayBufferLike) {
    this.ws?.send(data);
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default BiliWS;
