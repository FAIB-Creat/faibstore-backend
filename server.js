// =========================================================================
// FAIB STORE — BACKEND WEBHOOK NODE.JS (MIDTRANS & VIP RESELLER AUTO H2H)
// =========================================================================
// Hosting: Render.com, Railway.app, atau VPS Pribadi
// Dependencies: npm install express axios dotenv
// =========================================================================

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

app.use(express.json());

// Konfigurasi Environment Variables (Atur di Dashboard Render/Railway)
const PORT = process.env.PORT || 3000;
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || 'Mid-server-mlk-G_n6Ymy3UgwdaXwear1t';
const VIP_API_ID = process.env.VIP_API_ID || 'hA3ZxRSJ';
const VIP_API_KEY = process.env.VIP_API_KEY || 'e6f8406cdf5a736115262d820f0d3229';
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT || 'faib-store';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyABNf9TnKaY-e6QrIPWMZsUhjRX0xyLjB4';

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ACTIVE', store: 'FAIB STORE Webhook Server Online' });
});

// =========================================================================
// WEBHOOK NOTIFIKASI PEMBAYARAN DARI MIDTRANS
// =========================================================================
app.post('/webhook/midtrans', async (req, res) => {
  try {
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = req.body;

    // 1. Verifikasi tanda tangan kriptografi SHA-512 asli dari Midtrans
    const expectedSig = crypto
      .createHash('sha512')
      .update(`${order_id}${status_code}${gross_amount}${MIDTRANS_SERVER_KEY}`)
      .digest('hex');

    if (signature_key !== expectedSig) {
      console.warn(`[SECURITY WARNING] Invalid Midtrans signature for order: ${order_id}`);
      return res.status(403).json({ error: 'Invalid Midtrans Signature' });
    }

    // 2. Jika transaksi lunas (settlement / capture)
    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      console.log(`[PAYMENT SUCCESS] Order ${order_id} lunas. Memproses database & supplier...`);

      // Ambil detail pesanan dari Firebase Firestore
      const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT)}/databases/(default)/documents/faib_orders/${encodeURIComponent(order_id)}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
      const docRes = await axios.get(docUrl);
      
      if (!docRes.data || !docRes.data.fields || !docRes.data.fields.payload) {
        console.error(`[FIRESTORE ERROR] Pesanan ${order_id} tidak ditemukan di database.`);
        return res.status(404).json({ error: 'Order not found in database' });
      }

      const order = JSON.parse(docRes.data.fields.payload.stringValue);

      if (order.type === 'topup' && order.status === 'Menunggu Bayar') {
        // Ekstrak User ID & Zone ID dari format targetAccount ("184920312 (2941) • Nick")
        const match = order.targetAccount.match(/^(\d+)\s*\((\d+)\)/);
        const userId = match ? match[1] : '';
        const zoneId = match ? match[2] : '';

        if (userId && zoneId) {
          // Tembak API VIP Reseller untuk kirim Diamond/WDP secara otomatis
          const vipSign = crypto.createHash('md5').update(`${VIP_API_ID}${VIP_API_KEY}`).digest('hex');
          const form = new URLSearchParams({
            key: VIP_API_KEY,
            sign: vipSign,
            type: 'order',
            service: order.skuCode || 'ML86', // Sesuaikan kode layanan VIP Reseller
            data_no: userId,
            data_zone: zoneId,
          });

          try {
            const vipRes = await axios.post('https://vip-reseller.co.id/api/game-feature', form);
            if (vipRes.data && vipRes.data.result) {
              order.status = 'Selesai';
              console.log(`[VIP RESELLER SUCCESS] Top-up ${order_id} berhasil dikirim ke ${userId} (${zoneId})`);
            } else {
              order.status = 'Diproses';
              console.warn(`[VIP RESELLER PENDING] Respon supplier:`, vipRes.data);
            }
          } catch (vipErr) {
            order.status = 'Diproses';
            console.error(`[VIP RESELLER ERROR] Gagal menembak API supplier:`, vipErr.message);
          }
        } else {
          order.status = 'Diproses';
        }
      } else {
        // Jika pesanan Jasa Joki, ubah status ke Diproses agar owner segera mengerjakan
        order.status = 'Diproses';
      }

      // Update status terbaru ke Firebase Firestore agar langsung tampil real-time di HP pembeli & panel owner
      await axios.patch(docUrl, {
        fields: {
          payload: { stringValue: JSON.stringify(order) },
          updatedAt: { stringValue: new Date().toISOString() },
        },
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`FAIB STORE Backend Webhook berjalan di port ${PORT}`);
});