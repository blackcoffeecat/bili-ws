import { decompress } from 'brotli';
import nextTick from 'next-tick';
import { inflate } from 'pako';
import { getDecoder, getEncoder, toArrayBuffer } from './encoding';

export enum WS {
  WS_OP_HEARTBEAT = 2,
  WS_OP_HEARTBEAT_REPLY = 3,
  WS_OP_MESSAGE = 5,
  WS_OP_USER_AUTHENTICATION = 7,
  WS_OP_CONNECT_SUCCESS = 8,
  WS_PACKAGE_HEADER_TOTAL_LENGTH = 16,
  WS_PACKAGE_OFFSET = 0,
  WS_HEADER_OFFSET = 4,
  WS_VERSION_OFFSET = 6,
  WS_OPERATION_OFFSET = 8,
  WS_SEQUENCE_OFFSET = 12,
  WS_BODY_PROTOCOL_VERSION_NORMAL = 0,
  WS_BODY_PROTOCOL_VERSION_DEFLATE = 2,
  WS_BODY_PROTOCOL_VERSION_BROTLI = 3,
  WS_HEADER_DEFAULT_VERSION = 1,
  WS_HEADER_DEFAULT_OPERATION = 1,
  WS_HEADER_DEFAULT_SEQUENCE = 1,
}

export type OP =
  | WS.WS_OP_HEARTBEAT
  | WS.WS_OP_HEARTBEAT_REPLY
  | WS.WS_OP_MESSAGE
  | WS.WS_OP_USER_AUTHENTICATION
  | WS.WS_OP_CONNECT_SUCCESS
  | WS.WS_HEADER_DEFAULT_OPERATION;

export type VER =
  | WS.WS_BODY_PROTOCOL_VERSION_NORMAL
  | WS.WS_BODY_PROTOCOL_VERSION_DEFLATE
  | WS.WS_BODY_PROTOCOL_VERSION_BROTLI
  | WS.WS_HEADER_DEFAULT_VERSION;

export type OFFSET =
  | WS.WS_PACKAGE_OFFSET
  | WS.WS_HEADER_OFFSET
  | WS.WS_VERSION_OFFSET
  | WS.WS_OPERATION_OFFSET
  | WS.WS_SEQUENCE_OFFSET;

export type Head = {
  headerLen: number;
  seq: number;
  ver: VER;
  op: OP;
};

type HeadConf<K extends keyof Head> = {
  name: string;
  key: K;
  bytes: 2 | 4;
  offset: OFFSET;
  value: Head[K];
};

const headList = [
  {
    name: 'Header Length',
    key: 'headerLen',
    bytes: 2,
    offset: WS.WS_HEADER_OFFSET,
    value: WS.WS_PACKAGE_HEADER_TOTAL_LENGTH,
  } as HeadConf<'headerLen'>,
  {
    name: 'Protocol Version',
    key: 'ver',
    bytes: 2,
    offset: WS.WS_VERSION_OFFSET,
    value: WS.WS_HEADER_DEFAULT_VERSION,
  } as HeadConf<'ver'>,
  {
    name: 'Operation',
    key: 'op',
    bytes: 4,
    offset: WS.WS_OPERATION_OFFSET,
    value: WS.WS_HEADER_DEFAULT_OPERATION,
  } as HeadConf<'op'>,
  {
    name: 'Sequence Id',
    key: 'seq',
    bytes: 4,
    offset: WS.WS_SEQUENCE_OFFSET,
    value: WS.WS_HEADER_DEFAULT_SEQUENCE,
  } as HeadConf<'seq'>,
];

export type Body = any[];

export function convertToObject(buffer: ArrayBufferLike): [Head, Body] {
  const dv = new DataView(toArrayBuffer(buffer));
  const { byteLength } = buffer;
  const decoder = getDecoder();
  const head: Head = {
    headerLen: 0,
    seq: 0,
    ver: WS.WS_HEADER_DEFAULT_VERSION,
    op: WS.WS_HEADER_DEFAULT_OPERATION,
  };
  const data: Body = [];

  headList.forEach(data => {
    const { key, offset, bytes } = data;
    let { value } = data;
    if (bytes === 4) value = dv.getInt32(offset);
    if (bytes === 2) value = dv.getInt16(offset);
    head[key] = value;
  });

  if (head.op === WS.WS_OP_HEARTBEAT_REPLY) {
    data.push({ cmd: 'HEARTBEAT', online: dv.getInt32(WS.WS_PACKAGE_HEADER_TOTAL_LENGTH) });
    return [head, data];
  }

  for (let packetLength, offset = 0; offset < byteLength; offset += packetLength) {
    packetLength = dv.getUint32(offset);
    const buf = buffer.slice(offset + WS.WS_PACKAGE_HEADER_TOTAL_LENGTH, offset + packetLength);
    let newData = [];
    switch (head.ver) {
      case WS.WS_BODY_PROTOCOL_VERSION_DEFLATE:
        [, newData] = convertToObject(inflate(buf as Buffer).buffer);
        break;

      case WS.WS_BODY_PROTOCOL_VERSION_BROTLI:
        [, newData] = convertToObject(decompress(buf as Buffer).buffer);
        break;

      default:
        newData = [JSON.parse(decoder.decode(buf))];
    }

    data.push(...newData);
  }

  return [head, data];
}

function mergeArrayBuffer(a: ArrayBufferLike, b: ArrayBufferLike): ArrayBuffer {
  const head = new Uint8Array(a);
  const body = new Uint8Array(b);
  const all = new Uint8Array(head.byteLength + body.byteLength);
  all.set(head, 0);
  all.set(body, head.byteLength);
  return all.buffer;
}

export function convertToArrayBuffer(
  str: string,
  op: OP = WS.WS_HEADER_DEFAULT_OPERATION
): ArrayBuffer {
  const encoder = getEncoder();
  const head = new ArrayBuffer(16);
  const headDv = new DataView(head, 0);
  const body = encoder.encode(str);
  headDv.setInt32(WS.WS_PACKAGE_OFFSET, WS.WS_PACKAGE_HEADER_TOTAL_LENGTH + body.byteLength);
  headList.forEach(data => {
    const { key, bytes, offset } = data;
    let { value } = data;
    if (key === 'op') value = op;
    if (bytes === 4) headDv.setInt32(offset, value);
    if (bytes === 2) headDv.setInt16(offset, value);
  });

  return mergeArrayBuffer(head, body);
}

let heartbeatPack: ArrayBuffer;

export function getHeartbeatPack(): ArrayBuffer {
  if (!heartbeatPack) {
    heartbeatPack = convertToArrayBuffer(`[object Object]`, WS.WS_OP_HEARTBEAT);
  }
  return heartbeatPack;
}

export class Timer {
  constructor(readonly fn: () => void, readonly interval: number) {
    this.fn = fn;
    this.interval = interval;

    this.start();
  }

  private timer: ReturnType<typeof setTimeout> | null = null;

  private runner = () => {
    this.timer = setTimeout(this.runner, this.getTimeout());
    nextTick(this.fn);
  };

  private getTimeout() {
    return this.interval - ((Date.now() % 60e3) % this.interval);
  }

  public start(): void {
    if (!this.timer) this.timer = setTimeout(this.runner, this.getTimeout());
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export function createTimer(fn: () => void, interval: number): Timer {
  return new Timer(fn, interval);
}
