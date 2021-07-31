import { decompress } from 'brotli';
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

const headList = [
  {
    name: 'Header Length',
    key: 'headerLen',
    bytes: 2,
    offset: WS.WS_HEADER_OFFSET,
    value: WS.WS_PACKAGE_HEADER_TOTAL_LENGTH,
  },
  {
    name: 'Protocol Version',
    key: 'ver',
    bytes: 2,
    offset: WS.WS_VERSION_OFFSET,
    value: WS.WS_HEADER_DEFAULT_VERSION,
  },
  {
    name: 'Operation',
    key: 'op',
    bytes: 4,
    offset: WS.WS_OPERATION_OFFSET,
    value: WS.WS_HEADER_DEFAULT_OPERATION,
  },
  {
    name: 'Sequence Id',
    key: 'seq',
    bytes: 4,
    offset: WS.WS_SEQUENCE_OFFSET,
    value: WS.WS_HEADER_DEFAULT_SEQUENCE,
  },
];

export type Head = Record<string, any>;
export type Body = any[];

export function convertToObject(buffer: ArrayBufferLike): [Head, Body] {
  const dv = new DataView(toArrayBuffer(buffer));
  const { byteLength } = buffer;
  const decoder = getDecoder();
  const head: Head = {};
  const data: Body = [];

  headList.forEach(data => {
    const { key, offset, bytes } = data;
    let value;
    if (bytes === 4) value = dv.getInt32(offset);
    if (bytes === 2) value = dv.getInt16(offset);
    head[key] = value;
  });

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

      case WS.WS_BODY_PROTOCOL_VERSION_NORMAL:
        newData = [JSON.parse(decoder.decode(buf))];
        break;

      default:
        newData = [
          { cmd: 'HEARTBEAT', data: { online: new DataView(toArrayBuffer(buf)).getInt32(0) } },
        ];
    }

    data.push(...newData);
  }

  return [head, data];
}

function mergeArrayBuffer(a: ArrayBufferLike, b: ArrayBufferLike): ArrayBufferLike {
  const head = new Uint8Array(a);
  const body = new Uint8Array(b);
  const all = new Uint8Array(head.byteLength + body.byteLength);
  all.set(head, 0);
  all.set(body, head.byteLength);
  return all.buffer;
}

export function convertToArrayBuffer(str: string, op: WS = WS.WS_HEADER_DEFAULT_OPERATION) {
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

let heartbeatPack: ArrayBufferLike;

export function getHeartbeatPack() {
  if (!heartbeatPack) {
    heartbeatPack = convertToArrayBuffer(`[object Object]`, WS.WS_OP_HEARTBEAT);
  }
  return heartbeatPack;
}
