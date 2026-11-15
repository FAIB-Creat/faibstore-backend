const axios = require('axios');

const VIP_API_ID = process.env.VIP_API_ID;
const VIP_API_KEY = process.env.VIP_API_KEY;
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order_id, transaction_status } = req.body;

    if (transaction_status === 'settlement' || transaction_status === 'capture') {
      console.log(`Pembayaran Lunas untuk Order: ${order_id}`);
      // Lanjutkan logika penembakan ke VIP Reseller dan update Firebase di sini
    }

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};