import { EventEmitter } from 'events';
import { convertToArrayBuffer, convertToObject, getHeartbeatPack, Head, VER, WS } from './shared';

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
  port?: number;
  // eslint-disable-next-line camelcase
  ws_port?: number;
  // eslint-disable-next-line camelcase
  wss_port?: number;
};

// https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=<ROOM_ID>&type=0
// response.data.host_list[0]
const defaultHost = {
  host: 'broadcastlv.chat.bilibili.com',
  port: 2243,
  ws_port: 2244,
  wss_port: 443,
};

let timerInterval = 60e3;
const fnSet = new Set<sendFn>();
let timer: ReturnType<typeof setTimeout> | null = null;

function addHb(send: sendFn) {
  fnSet.add(send);
  send(getHeartbeatPack());
  // eslint-disable-next-line no-use-before-define
  startHb();
}

function rmHb(send: sendFn) {
  fnSet.delete(send);
}

function hbFn() {
  if (timer) timer = null;
  if (!fnSet.size) return;
  timer = setTimeout(hbFn, timerInterval);
  const hbp = getHeartbeatPack();
  fnSet.forEach(send => {
    try {
      send(hbp);
    } catch {
      //
    }
  });
}

function startHb() {
  if (!timer) timer = setTimeout(hbFn, timerInterval);
}

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

  public static setHeartbeatInterval(interval: number) {
    timerInterval = interval;
  }

  ver: VER = WS.WS_BODY_PROTOCOL_VERSION_BROTLI;

  bufferOnly = false;

  hasData = false;

  online = -1;

  createConn(create: createCallbacks): void {
    const send = (hbp: ArrayBufferLike) => {
      if (!this.hasData) {
        this.close();
        return;
      }
      this.send(hbp);
    };
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
      this.once('buffer', () => {
        addHb(send);
      });
      this.emit('open');
    };
    const onClose = () => {
      rmHb(send);
      this.emit('close');
      this.online = -1;
    };

    const handleMessage: handleMessageFn = onMsg => data => {
      this.hasData = true;
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
