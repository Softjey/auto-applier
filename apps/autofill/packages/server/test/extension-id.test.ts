import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EXTENSION_ID, EXTENSION_MANIFEST_KEY } from '@applier/protocol';

/** Chrome's rule: id = first 16 bytes of sha256(public key DER), each nibble mapped to a–p. */
const idOf = (keyBase64: string): string =>
  [...createHash('sha256').update(Buffer.from(keyBase64, 'base64')).digest().subarray(0, 16)]
    .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15)))
    .join('');

describe('extension identity', () => {
  it('the pinned id is the one the manifest key produces', () => {
    expect(idOf(EXTENSION_MANIFEST_KEY)).toBe(EXTENSION_ID);
  });
});
