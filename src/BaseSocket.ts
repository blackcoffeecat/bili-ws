import { EventEmitter } from 'events';
import { convertToArrayBuffer, convertToObject, getHeartbeatPack, WS } from './shared';

export type sendFn = (b: ArrayBufferLike) => void;
export type onMsgFn = (cmd: string, data: any) => void;
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
  add(send: sendFn) {
    this.set.add(send);
    send(getHeartbeatPack());
    this.run();
  },
  remove(send: sendFn) {
    this.set.delete(send);
  },
  run() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.set.size) {
        clearInterval(this.timer);
        this.timer = null;
      }

      const itr = this.set.values();
      let next = itr.next();
      const hbp = getHeartbeatPack();
      while (!next.done) {
        next.value(hbp);
        next = itr.next();
      }
    }, 30e3);
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

  createConn(create: createCallbacks) {
    const send = this.send.bind(this);
    const onOpen = () => {
      const hi: Record<string, number | string> = {
        roomid: this.roomId,
        platform: 'web',
        protover: 3,
        uid: 0,
        type: 2,
      };
      if (this.token) hi.key = this.token;

      this.send(convertToArrayBuffer(JSON.stringify(hi), WS.WS_OP_USER_AUTHENTICATION));
      heartbeat.add(send);
    };
    const onClose = () => {
      heartbeat.remove(send);
    };
    const handleMessage: handleMessageFn = onMsg => data => {
      const [, body] = convertToObject(data);
      body.forEach(msg => {
        onMsg(msg.cmd, msg.data);
        onMsg('msg', msg);
      });
    };
    create(onOpen, onClose, handleMessage);
  }

  abstract connect(): void;

  abstract close(): void;

  abstract send(data: ArrayBufferLike): void;
}

export default BaseSocket;
