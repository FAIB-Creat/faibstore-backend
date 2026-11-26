// api/joki-decrypt.js
import crypto from 'crypto';

const SUPABASE_URL = 'https://srlkktnhonecypxzudgo.supabase.co';
const VAULT_PEPPER = 'FAIB-STORE-AES256-VAULT-2026';

function decryptLegacyVault(encryptedStr) {
  if (!encryptedStr || !String(encryptedStr).startsWith('ENC:')) return encryptedStr;
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

    // 1. Cek di tabel terisolasi joki_credentials
    const credRes = await fetch(
      `${SUPABASE_URL}/rest/v1/joki_credentials?order_invoice=eq.${encodeURIComponent(invoice)}&select=*`,
      { headers: sbHeaders }
    );
    const credRows = await credRes.json();

    if (Array.isArray(credRows) && credRows.length > 0) {
      const cred = credRows[0];
      return res.status(200).json({
        loginVia: cred.login_via,
        loginId: decryptLegacyVault(cred.encrypted_email),
        password: decryptLegacyVault(cred.encrypted_password),
        nickname: cred.nickname,
        note: cred.notes,
      });
    }

    // 2. Fallback untuk pesanan lama di store_orders
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
      loginId: decryptLegacyVault(c.loginId),
      password: decryptLegacyVault(c.password),
      nickname: oldPayload.targetAccount,
      note: c.note,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}