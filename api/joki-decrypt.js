const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://srlkktnhonecypxzudgo.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  'sb_publishable_bM1VKoWBW-qpNnqVS-MjkQ_iQwwi2YT';

const OWNER_PIN = process.env.OWNER_PIN || '123456';
const VAULT_PEPPER = process.env.VAULT_PEPPER || 'FAIB-STORE-AES256-VAULT-2026';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function getNormalizedPrivateKey() {
  let raw = process.env.VAULT_PRIVATE_KEY || '';
  raw = raw.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim();
  if (!raw) return null;

  if (!raw.includes('-----BEGIN')) {
    const cleanB64 = raw.replace(/\s+/g, '');
    const wrapped = cleanB64.match(/.{1,64}/g)?.join('\n') || cleanB64;
    raw = `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
  }

  return crypto.createPrivateKey({
    key: raw,
    format: 'pem',
  });
}

function decryptCredentialField(cipherStr, privateKeyObj) {
  if (!cipherStr || typeof cipherStr !== 'string') return '';

  // Format 1: Hybrid RSA-OAEP (SHA-256) + AES-256-GCM
  if (cipherStr.startsWith('RSA256:')) {
    if (!privateKeyObj) {
      throw new Error('VAULT_PRIVATE_KEY belum dikonfigurasi di server Vercel.');
    }

    const parts = cipherStr.split(':');
    if (parts.length !== 4) {
      throw new Error('Format ciphertext RSA256 tidak valid.');
    }

    const wrappedAesBuf = Buffer.from(parts[1], 'base64');
    const ivBuf = Buffer.from(parts[2], 'base64');
    const cipherWithTagBuf = Buffer.from(parts[3], 'base64');

    const rawAesKey = crypto.privateDecrypt(
      {
        key: privateKeyObj,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      wrappedAesBuf
    );

    const authTag = cipherWithTagBuf.subarray(cipherWithTagBuf.length - 16);
    const encryptedData = cipherWithTagBuf.subarray(0, cipherWithTagBuf.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', rawAesKey, ivBuf);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // Format 2: Legacy PBKDF2 + AES-256-GCM (ENC:iv:cipherWithTag)
  if (cipherStr.startsWith('ENC:')) {
    const parts = cipherStr.split(':');
    if (parts.length !== 3) {
      throw new Error('Format ciphertext ENC tidak valid.');
    }

    const ivBuf = Buffer.from(parts[1], 'base64');
    const cipherWithTagBuf = Buffer.from(parts[2], 'base64');

    const derivedKey = crypto.pbkdf2Sync(
      VAULT_PEPPER,
      'faib_vault_salt_v1',
      100000,
      32,
      'sha256'
    );

    const authTag = cipherWithTagBuf.subarray(cipherWithTagBuf.length - 16);
    const encryptedData = cipherWithTagBuf.subarray(0, cipherWithTagBuf.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, ivBuf);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted.toString('utf8');
  }

  return cipherStr;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-owner-pin');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const pinHeader = String(req.headers['x-owner-pin'] || '').trim();
    if (!pinHeader || pinHeader !== String(OWNER_PIN).trim()) {
      return res.status(401).json({ error: 'PIN Owner tidak valid.' });
    }

    const { invoice, action } = req.body || {};
    const cleanInvoice = String(invoice || '').trim();

    if (!cleanInvoice) {
      return res.status(400).json({ error: 'Nomor invoice wajib diisi.' });
    }

    const { data: row, error: fetchErr } = await supabase
      .from('store_orders')
      .select('invoice, payload')
      .eq('invoice', cleanInvoice)
      .maybeSingle();

    if (fetchErr) {
      return res.status(500).json({ error: `Database error: ${fetchErr.message}` });
    }

    if (!row || !row.payload) {
      return res.status(404).json({ error: `Invoice ${cleanInvoice} tidak ditemukan.` });
    }

    const orderPayload = row.payload;

    if (action === 'wipe') {
      const wipedPayload = {
        ...orderPayload,
        credentials: {
          wiped: true,
          wipedAt: new Date().toISOString(),
        },
      };

      const { error: updateErr } = await supabase
        .from('store_orders')
        .update({
          payload: wipedPayload,
          updated_at: new Date().toISOString(),
        })
        .eq('invoice', cleanInvoice);

      if (updateErr) {
        return res.status(500).json({ error: `Gagal memusnahkan data: ${updateErr.message}` });
      }

      return res.status(200).json({
        success: true,
        message: 'Kredensial akun berhasil dimusnahkan permanen.',
      });
    }

    const creds = orderPayload.credentials;
    if (!creds) {
      return res.status(404).json({ error: 'Pesanan ini tidak memiliki data login (Joki Gendong / Top-Up).' });
    }

    if (creds.wiped) {
      return res.status(410).json({ error: 'Data akun untuk invoice ini sudah dimusnahkan permanen.' });
    }

    let privateKeyObj = null;
    if (
      String(creds.loginId || '').startsWith('RSA256:') ||
      String(creds.password || '').startsWith('RSA256:')
    ) {
      privateKeyObj = getNormalizedPrivateKey();
    }

    const decryptedLoginId = decryptCredentialField(creds.loginId, privateKeyObj);
    const decryptedPassword = decryptCredentialField(creds.password, privateKeyObj);

    return res.status(200).json({
      success: true,
      invoice: cleanInvoice,
      loginVia: creds.loginVia || '-',
      nickname: orderPayload.targetAccount || '-',
      loginId: decryptedLoginId,
      password: decryptedPassword,
      note: creds.note || 'Tidak ada catatan',
    });
  } catch (err) {
    console.error('[joki-decrypt error]', err);
    return res.status(500).json({
      error: err?.message || 'Gagal mendekripsi data akun joki.',
    });
  }
};