import * as net from 'net';
import BaseSocket from '../../BaseSocket';
import { toBuffer } from '../../encoding';

class BiliWS extends BaseSocket {
  private socket: net.Socket | null = null;

  connect() {
    this.close();

    const { host, port } = this.host;
    const socket = net.connect(port, host);
    this.socket = socket;

    this.createConn((onOpen, onClose, handleMessage) => {
      const onMessage = handleMessage((cmd, data) => {
        this.emit('msg', cmd, data);
        this.emit(cmd, data);
      });

      socket.on('ready', onOpen);
      socket.on('close', onClose);
      let buffer = Buffer.alloc(0);
      socket.on('data', newBuffer => {
        buffer = Buffer.concat([buffer, newBuffer]);
        while (buffer.length >= 4 && buffer.readInt32BE(0) <= buffer.length) {
          const size = buffer.readInt32BE(0);
          const pack = buffer.slice(0, size);
          buffer = buffer.slice(size);

          onMessage(pack);
        }
      });
    });
  }

  send(data: ArrayBufferLike) {
    this.socket?.write(toBuffer(data));
  }

  close() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
export default BiliWS;
