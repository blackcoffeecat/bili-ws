import { EventEmitter } from 'events';
import {
  convertToArrayBuffer,
  convertToObject,
  createTimer,
  getHeartbeatPack,
  Head,
  VER,
  WS,
} from './shared';

export type sendFn = (b: ArrayBufferLike) => void;
export type onMsgFn = (head: Head, data: any) => void;
export type onMessageFn = (data: ArrayBufferLike) => void;
export type handleMessageFn = (onMsg: onMsgFn) => onMessageFn;
export type createCallbacks = (
  onOpen: () => void,
  onClose: () => void,
  handleMessage: handleMessageFn
) => void;

export type Host = {
  host: string;
  port: number;
  // eslint-disable-next-line camelcase
  ws_port: number;
  // eslint-disable-next-line camelcase
  wss_port: number;
};

// https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=<ROOM_ID>&type=0
// response.data.host_list[0]
const defaultHost = {
  host: 'broadcastlv.chat.bilibili.com',
  port: 2243,
  ws_port: 2244,
  wss_port: 443,
};

const heartbeat = {
  set: new Set<sendFn>(),
  timer: null,
  get size() {
    return this.set.size;
  },
  add(send: sendFn) {
    this.set.add(send);
    send(getHeartbeatPack());
    this.run();
  },
  remove(send: sendFn) {
    this.set.delete(send);
  },
  run() {
    if (!this.timer) {
      this.timer = createTimer(() => {
        if (!this.size) {
          this.timer.stop();
          return;
        }
        this.send();
      }, 30e3);
    }

    this.timer.start();
  },
  send() {
    const itr = this.set.values();
    let next = itr.next();
    const hbp = getHeartbeatPack();
    while (!next.done) {
      next.value(hbp);
      next = itr.next();
    }
  },
};

abstract class BaseSocket extends EventEmitter {
  protected constructor(
    readonly roomId: number,
    readonly token = '',
    readonly host: Host = defaultHost
  ) {
    super();
    this.roomId = roomId;
    this.host = host;
    this.token = token;

    setTimeout(() => {
      this.connect();
    });
  }

  ver: VER = WS.WS_BODY_PROTOCOL_VERSION_BROTLI;

  bufferOnly = false;

  online = -1;

  createConn(create: createCallbacks): void {
    const send = this.send.bind(this);
    const onOpen = () => {
      const hi: Record<string, number | string> = {
        roomid: this.roomId,
        platform: 'web',
        protover: this.ver,
        uid: 0,
        type: 2,
      };
      if (this.token) hi.key = this.token;

      this.send(convertToArrayBuffer(JSON.stringify(hi), WS.WS_OP_USER_AUTHENTICATION));
      heartbeat.add(send);
      this.emit('open');
    };
    const onClose = () => {
      heartbeat.remove(send);
      this.emit('close');
      this.online = -1;
    };

    const handleMessage: handleMessageFn = onMsg => data => {
      this.emit('buffer', data);
      if (!this.bufferOnly) {
        const [head, body] = convertToObject(data);
        body.forEach(msg => {
          onMsg(head, msg);
          this.emit('msg', msg, head);
          if (msg.cmd === 'HEARTBEAT') {
            this.online = msg.online;
          }
        });
      }
    };
    create(onOpen, onClose, handleMessage);
  }

  abstract connect(): void;

  abstract close(): void;

  abstract send(data: ArrayBufferLike): void;
}

export default BaseSocket;
