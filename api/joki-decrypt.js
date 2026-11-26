// api/joki-decrypt.js
import crypto from 'crypto';

const SUPABASE_URL = 'https://srlkktnhonecypxzudgo.supabase.co';
const VAULT_PEPPER = 'FAIB-STORE-AES256-VAULT-2026';

// Dekripsi format baru RSA256:<encryptedAesKeyB64>:<ivB64>:<cipherAndTagB64>
function decryptRsaHybrid(encryptedStr) {
  const rawPem = process.env.RSA_PRIVATE_KEY;
  if (!rawPem) {
    throw new Error('RSA_PRIVATE_KEY belum diset di Environment Variables Vercel!');
  }

  // Normalisasi newline jika tersimpan sebagai \n satu baris di Vercel
  const privateKey = rawPem.replace(/\\n/g, '\n');

  const parts = String(encryptedStr).split(':');
  if (parts.length !== 4) {
    throw new Error('Format RSA256 tidak valid');
  }

  const [, encKeyB64, ivB64, cipherB64] = parts;

  // 1. Buka AES-256 key menggunakan RSA-OAEP SHA-256 Private Key
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encKeyB64, 'base64')
  );

  // 2. Dekripsi payload menggunakan AES-256-GCM
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(cipherB64, 'base64');
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Dekripsi format lama ENC:<ivB64>:<cipherAndTagB64>
function decryptLegacyVault(encryptedStr) {
  const [, ivB64, cipherB64] = String(encryptedStr).split(':');
  const key = crypto.pbkdf2Sync(VAULT_PEPPER, 'faib_vault_salt_v1', 100000, 32, 'sha256');
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(cipherB64, 'base64');
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decryptCredential(str) {
  if (!str) return '';
  const s = String(str);
  if (s.startsWith('RSA256:')) return decryptRsaHybrid(s);
  if (s.startsWith('ENC:')) return decryptLegacyVault(s);
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-owner-pin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diset di Vercel!' });
  }

  const pin = req.headers['x-owner-pin'];
  const validPin = process.env.OWNER_ADMIN_PIN || '123456';
  if (!pin || pin !== validPin) {
    return res.status(401).json({ error: 'PIN Owner tidak valid' });
  }

  const { invoice, action } = req.body || {};
  if (!invoice) return res.status(400).json({ error: 'Invoice wajib diisi' });

  const sbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    if (action === 'wipe') {
      await fetch(
        `${SUPABASE_URL}/rest/v1/joki_credentials?order_invoice=eq.${encodeURIComponent(invoice)}`,
        { method: 'DELETE', headers: sbHeaders }
      );
      return res.status(200).json({ success: true });
    }

    const credRes = await fetch(
      `${SUPABASE_URL}/rest/v1/joki_credentials?order_invoice=eq.${encodeURIComponent(invoice)}&select=*`,
      { headers: sbHeaders }
    );
    const credRows = await credRes.json();

    if (Array.isArray(credRows) && credRows.length > 0) {
      const cred = credRows[0];
      return res.status(200).json({
        loginVia: cred.login_via,
        loginId: decryptCredential(cred.encrypted_email),
        password: decryptCredential(cred.encrypted_password),
        nickname: cred.nickname,
        note: cred.notes,
      });
    }

    const oldRes = await fetch(
      `${SUPABASE_URL}/rest/v1/store_orders?invoice=eq.${encodeURIComponent(invoice)}&select=payload`,
      { headers: sbHeaders }
    );
    const oldRows = await oldRes.json();
    const oldPayload = Array.isArray(oldRows) && oldRows[0]?.payload;
    const c = oldPayload?.credentials;

    if (!c) {
      return res.status(404).json({ error: 'Data kredensial joki tidak ditemukan di database' });
    }

    return res.status(200).json({
      loginVia: c.loginVia,
      loginId: decryptCredential(c.loginId),
      password: decryptCredential(c.password),
      nickname: oldPayload.targetAccount,
      note: c.note,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}