// api/joki-decrypt.js (Repo faibstore-backend)
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  'https://srlkktnhonecypxzudgo.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAULT_PEPPER = 'FAIB-STORE-AES256-VAULT-2026';

// Dekripsi format ENC:iv:cipher dari index.html
function decryptLegacyVault(encryptedStr) {
  if (!encryptedStr || !encryptedStr.startsWith('ENC:')) return encryptedStr;
  const [, ivB64, cipherB64] = encryptedStr.split(':');
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

  // Validasi PIN Owner di server
  const pin = req.headers['x-owner-pin'];
  const validPin = process.env.OWNER_ADMIN_PIN || '123456';
  if (!pin || pin !== validPin) {
    return res.status(401).json({ error: 'PIN Owner tidak valid' });
  }

  const { invoice, action } = req.body || {};
  if (!invoice) return res.status(400).json({ error: 'Invoice wajib diisi' });

  // Aksi hapus permanen kredensial setelah joki selesai
  if (action === 'wipe') {
    await supabaseAdmin.from('joki_credentials').delete().eq('order_invoice', invoice);
    return res.status(200).json({ success: true });
  }

  // 1. Cek di tabel terisolasi joki_credentials
  const { data: cred } = await supabaseAdmin
    .from('joki_credentials')
    .select('*')
    .eq('order_invoice', invoice)
    .maybeSingle();

  if (cred) {
    return res.status(200).json({
      loginVia: cred.login_via,
      loginId: decryptLegacyVault(cred.encrypted_email),
      password: decryptLegacyVault(cred.encrypted_password),
      nickname: cred.nickname,
      note: cred.notes,
    });
  }

  // 2. Fallback untuk pesanan lama (seperti FAIB-3TQ4KF) yang masih di store_orders
  const { data: oldOrder } = await supabaseAdmin
    .from('store_orders')
    .select('payload')
    .eq('invoice', invoice)
    .maybeSingle();

  const c = oldOrder?.payload?.credentials;
  if (!c) return res.status(404).json({ error: 'Data kredensial joki tidak ditemukan' });

  return res.status(200).json({
    loginVia: c.loginVia,
    loginId: decryptLegacyVault(c.loginId),
    password: decryptLegacyVault(c.password),
    nickname: oldOrder.payload.targetAccount,
    note: c.note,
  });
}