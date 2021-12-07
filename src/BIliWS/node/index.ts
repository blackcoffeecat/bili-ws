import * as net from 'net';
import BaseSocket from '../../BaseSocket';
import { toBuffer } from '../../encoding';
import { chunkReader } from '../../shared';

class BiliWS extends BaseSocket {
  private socket: net.Socket | null = null;

  connect(): void {
    this.close();

    const { host, port } = this.host;
    const socket = net.connect(port ?? 2243, host);
    this.socket = socket;

    socket.on('error', () => {
      if (socket === this.socket) this.close();
    });
    socket.on('timeout', () => {
      if (socket === this.socket) this.close();
    });

    this.createConn((onOpen, onClose, handleMessage) => {
      const onMessage = handleMessage((head, data) => {
        this.emit(data.cmd || head.op, data);
      });
      const eachChunk = chunkReader(onMessage);
      socket.on('ready', onOpen);
      socket.on('close', onClose);
      socket.on('data', eachChunk);
    });
  }

  send(data: ArrayBufferLike): void {
    this.socket?.write(toBuffer(data));
  }

  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
export default BiliWS;
