const axios = require('axios');

const VIP_API_ID = 'hA3ZxRSJ';
const VIP_API_KEY = 'e6f8406cdf5a736115262d820f0d3229';
const FIREBASE_PROJECT = 'faib-store';
const FIREBASE_API_KEY = 'AIzaSyABNf9TnKaY-e6QrIPWMZsUhjRX0xyLjB4';

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