export const isProtoOf = (proto: NonNullable<any>, obj: any): boolean => {
  return Object.prototype.isPrototypeOf.call(proto.prototype, obj);
};

const hasBuffer = typeof Buffer !== 'undefined';
export const isBuffer = (buf: any): boolean => hasBuffer && isProtoOf(Buffer, buf);

export const isArrayBuffer = (buf: any): boolean => isProtoOf(ArrayBuffer, buf);

export const toBuffer = (buffer: ArrayBufferLike): Buffer => {
  if (!hasBuffer) throw new Error('no Buffer type.');
  if (isBuffer(buffer)) return buffer as Buffer;
  return Buffer.from(buffer);
};

export const toArrayBuffer = (buffer: ArrayBufferLike): ArrayBuffer => {
  if (isArrayBuffer(buffer)) return buffer as ArrayBuffer;
  return Uint8Array.from(buffer as Buffer).buffer;
};

let encoder: { encode(str: string): ArrayBuffer };
export function getEncoder() {
  if (!encoder) {
    if (typeof TextEncoder !== 'undefined') {
      encoder = new TextEncoder();
    } else {
      encoder = {
        encode(str) {
          const array = new Uint8Array();
          for (let i = 0; i < str.length; i += 1) {
            array[i] = str.charCodeAt(i);
          }
          return array.buffer;
        },
      };
    }
  }
  return encoder;
}

let decoder: { decode(buffer: ArrayBufferLike): string };
export function getDecoder() {
  if (!decoder) {
    if (typeof TextDecoder !== 'undefined') {
      decoder = new TextDecoder();
    } else {
      decoder = {
        decode(buffer) {
          const arr = new Uint8Array(buffer) as unknown as Array<number>;
          return decodeURIComponent(escape(String.fromCharCode(...arr)));
        },
      };
    }
  }

  return decoder;
}
