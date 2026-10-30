// Minimal DER reader and X.509 certificate decoder.

import { base64ToBytes, bytesToHex } from './encoding.js';

export function readDer(bytes, offset = 0) {
  const tag = bytes[offset];
  let len = bytes[offset + 1];
  let header = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('Unsupported DER length.');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[offset + 2 + i];
    header += n;
  }
  const start = offset + header;
  const end = start + len;
  if (end > bytes.length) throw new Error('Truncated DER data.');
  const node = { tag, cls: tag >> 6, constructed: !!(tag & 0x20), number: tag & 0x1f, start, end, header: offset, bytes: bytes.subarray(start, end), raw: bytes.subarray(offset, end), children: [] };
  if (node.constructed) {
    let p = start;
    while (p < end) {
      const child = readDer(bytes, p);
      node.children.push(child);
      p = child.end;
    }
  }
  return node;
}

export function decodeOid(bytes) {
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let v = 0n;
  for (let i = 1; i < bytes.length; i++) {
    v = (v << 7n) | BigInt(bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) { parts.push(v); v = 0n; }
  }
  return parts.join('.');
}

const OIDS = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber',
  '1.2.840.113549.1.9.1': 'E', '0.9.2342.19200300.100.1.25': 'DC', '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.1.1': 'RSA', '1.2.840.10045.2.1': 'EC', '1.3.101.112': 'Ed25519',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption', '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption', '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS', '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512', '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521',
  '2.5.29.17': 'Subject Alternative Name', '2.5.29.19': 'Basic Constraints', '2.5.29.15': 'Key Usage', '2.5.29.37': 'Extended Key Usage',
  '2.5.29.14': 'Subject Key Identifier', '2.5.29.35': 'Authority Key Identifier', '2.5.29.31': 'CRL Distribution Points',
  '2.5.29.32': 'Certificate Policies', '1.3.6.1.5.5.7.1.1': 'Authority Information Access', '1.3.6.1.4.1.11129.2.4.2': 'SCT List',
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication', '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing', '1.3.6.1.5.5.7.3.4': 'E-mail Protection', '1.3.6.1.5.5.7.3.8': 'Time Stamping',
};
export const oidName = (oid) => OIDS[oid] ?? oid;

const text = (node) => {
  if (node.tag === 0x1e) { // BMPString
    let s = '';
    for (let i = 0; i < node.bytes.length; i += 2) s += String.fromCharCode((node.bytes[i] << 8) | node.bytes[i + 1]);
    return s;
  }
  return new TextDecoder().decode(node.bytes);
};

function parseTime(node) {
  const s = text(node);
  const m = node.tag === 0x17
    ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s)
    : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s);
  if (!m) return null;
  let year = Number(m[1]);
  if (node.tag === 0x17) year += year < 50 ? 2000 : 1900;
  return new Date(Date.UTC(year, m[2] - 1, m[3], m[4], m[5], m[6] ?? 0));
}

function parseName(node) {
  const parts = [];
  for (const rdn of node.children) for (const atv of rdn.children) {
    parts.push([oidName(decodeOid(atv.children[0].bytes)), text(atv.children[1])]);
  }
  return parts;
}

const KEY_USAGES = ['Digital Signature', 'Non Repudiation', 'Key Encipherment', 'Data Encipherment', 'Key Agreement', 'Certificate Sign', 'CRL Sign', 'Encipher Only', 'Decipher Only'];

function describeExtension(oid, value) {
  try {
    const v = readDer(value);
    switch (oid) {
      case '2.5.29.17':
        return v.children.map((n) => {
          const kind = { 1: 'email', 2: 'DNS', 6: 'URI', 7: 'IP' }[n.number] ?? `[${n.number}]`;
          const val = n.number === 7 ? Array.from(n.bytes).join(n.bytes.length === 4 ? '.' : ':') : new TextDecoder().decode(n.bytes);
          return `${kind}: ${val}`;
        }).join(', ');
      case '2.5.29.19': {
        const ca = v.children[0]?.tag === 0x01 && v.children[0].bytes[0] !== 0;
        const path = v.children.find((c) => c.tag === 0x02);
        return `CA: ${ca}${path ? `, path length: ${path.bytes[0]}` : ''}`;
      }
      case '2.5.29.15': {
        const bits = v.bytes.subarray(1);
        return KEY_USAGES.filter((_, i) => bits[i >> 3] & (0x80 >> (i & 7))).join(', ');
      }
      case '2.5.29.37':
        return v.children.map((c) => oidName(decodeOid(c.bytes))).join(', ');
      case '2.5.29.14':
        return bytesToHex(v.bytes, true).match(/../g).join(':');
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function pemToDer(input) {
  const trimmed = input.trim();
  const m = /-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/.exec(trimmed);
  return base64ToBytes(m ? m[1] : trimmed);
}

export async function decodeCertificate(der) {
  const cert = readDer(der);
  const [tbs, sigAlg] = cert.children;
  if (!tbs || !sigAlg) throw new Error('Not an X.509 certificate.');
  let i = 0;
  let version = 1;
  if (tbs.children[0].tag === 0xa0) { version = tbs.children[0].children[0].bytes[0] + 1; i++; }
  const serial = bytesToHex(tbs.children[i++].bytes, true);
  i++; // signature algorithm repeated inside the TBS
  const issuer = parseName(tbs.children[i++]);
  const validity = tbs.children[i++];
  const subject = parseName(tbs.children[i++]);
  const spki = tbs.children[i++];
  const keyAlgOid = decodeOid(spki.children[0].children[0].bytes);
  const keyParam = spki.children[0].children[1];
  let keyDescription = oidName(keyAlgOid);
  if (keyAlgOid === '1.2.840.113549.1.1.1') {
    const rsa = readDer(spki.children[1].bytes.subarray(1));
    let mod = rsa.children[0].bytes;
    if (mod[0] === 0) mod = mod.subarray(1);
    keyDescription += ` ${mod.length * 8} bit`;
  } else if (keyParam?.tag === 0x06) {
    keyDescription += ` ${oidName(decodeOid(keyParam.bytes))}`;
  }
  const extensions = [];
  const extWrapper = tbs.children.slice(i).find((c) => c.tag === 0xa3);
  if (extWrapper) {
    for (const ext of extWrapper.children[0].children) {
      const oid = decodeOid(ext.children[0].bytes);
      const critical = ext.children.length === 3 && ext.children[1].bytes[0] !== 0;
      const value = ext.children[ext.children.length - 1].bytes;
      extensions.push({ oid, name: oidName(oid), critical, value: describeExtension(oid, value) ?? `${value.length} bytes` });
    }
  }
  const fingerprint = async (alg) => bytesToHex(new Uint8Array(await crypto.subtle.digest(alg, der)), true).match(/../g).join(':');
  const notBefore = parseTime(validity.children[0]);
  const notAfter = parseTime(validity.children[1]);
  return {
    version, serial, subject, issuer, notBefore, notAfter,
    expired: notAfter < new Date(),
    selfSigned: JSON.stringify(subject) === JSON.stringify(issuer),
    signatureAlgorithm: oidName(decodeOid(sigAlg.children[0].bytes)),
    publicKey: keyDescription,
    extensions,
    sha1: await fingerprint('SHA-1'),
    sha256: await fingerprint('SHA-256'),
  };
}
