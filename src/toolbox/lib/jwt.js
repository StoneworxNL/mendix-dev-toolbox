// JWT decode, sign (HMAC) and verify (HMAC, RSA, RSA-PSS, ECDSA) using Web Crypto.

import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './encoding.js';
import { pemToDer } from './asn1.js';
import { parseJson } from './json.js';

const b64url = (bytes) => bytesToBase64(bytes, { urlSafe: true, padding: false });
const jsonPart = (part) => parseJson(utf8Decode(base64ToBytes(part))); // keeps 64-bit IDs exact

export function decodeJwt(token) {
  const parts = token.trim().split('.');
  if (parts.length < 2) throw new Error('A JWT has three dot-separated parts.');
  let header, payload;
  try { header = jsonPart(parts[0]); } catch { throw new Error('The header is not valid Base64URL JSON.'); }
  try { payload = jsonPart(parts[1]); } catch { throw new Error('The payload is not valid Base64URL JSON.'); }
  return { header, payload, signature: parts[2] ?? '', signingInput: `${parts[0]}.${parts[1]}` };
}

const HASH = { 256: 'SHA-256', 384: 'SHA-384', 512: 'SHA-512' };

function algorithm(alg) {
  const m = /^(HS|RS|PS|ES)(256|384|512)$/.exec(alg ?? '');
  if (!m) throw new Error(`Unsupported algorithm "${alg}".`);
  const hash = HASH[m[2]];
  switch (m[1]) {
    case 'HS': return { kind: 'hmac', params: { name: 'HMAC', hash } };
    case 'RS': return { kind: 'public', params: { name: 'RSASSA-PKCS1-v1_5', hash } };
    case 'PS': return { kind: 'public', params: { name: 'RSA-PSS', hash }, sign: { name: 'RSA-PSS', saltLength: Number(m[2]) / 8 } };
    case 'ES': return { kind: 'public', params: { name: 'ECDSA', namedCurve: { 256: 'P-256', 384: 'P-384', 512: 'P-521' }[m[2]] }, sign: { name: 'ECDSA', hash } };
  }
}

async function hmacKey(secret, secretIsBase64, params, usage) {
  const raw = secretIsBase64 ? base64ToBytes(secret) : utf8Encode(secret);
  return crypto.subtle.importKey('raw', raw, params, false, [usage]);
}

export async function signJwt(header, payload, secret, { secretIsBase64 = false } = {}) {
  const alg = algorithm(header.alg);
  if (alg.kind !== 'hmac') throw new Error('Signing is supported for HS256, HS384 and HS512.');
  const input = `${b64url(utf8Encode(JSON.stringify(header)))}.${b64url(utf8Encode(JSON.stringify(payload)))}`;
  const key = await hmacKey(secret, secretIsBase64, alg.params, 'sign');
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8Encode(input)));
  return `${input}.${b64url(sig)}`;
}

export async function verifyJwt(token, keyText, { secretIsBase64 = false } = {}) {
  const { header, signature, signingInput } = decodeJwt(token);
  const alg = algorithm(header.alg);
  const sig = base64ToBytes(signature);
  const data = utf8Encode(signingInput);
  if (alg.kind === 'hmac') {
    const key = await hmacKey(keyText, secretIsBase64, alg.params, 'verify');
    return crypto.subtle.verify('HMAC', key, sig, data);
  }
  if (!/BEGIN PUBLIC KEY/.test(keyText)) throw new Error('Paste the public key as PEM (-----BEGIN PUBLIC KEY-----).');
  const key = await crypto.subtle.importKey('spki', pemToDer(keyText), alg.params, false, ['verify']);
  return crypto.subtle.verify(alg.sign ?? alg.params, key, sig, data);
}

export const CLAIMS = {
  iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'JWT ID',
  name: 'Name', email: 'E-mail', scope: 'Scope', azp: 'Authorized party', nonce: 'Nonce', sid: 'Session ID',
};
