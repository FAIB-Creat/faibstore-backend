const axios = require('axios');

module.exports = async (req, res) => {
  // Mengizinkan akses dari domain frontend Netlify kamu
  res.setHeader('Access-Control-Allow-Origin', 'https://faibstore.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order_id, gross_amount, item_name, customer_phone, user_id, zone_id, service_code } = req.body;

    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const encodedKey = Buffer.from(`${serverKey}:`).toString('base64');

    // Ganti ke 'https://app.sandbox.midtrans.com/snap/v1/transactions' jika masih mode Sandbox
    const midtransUrl = 'https://app.midtrans.com/snap/v1/transactions';

    const payload = {
      transaction_details: {
        order_id: order_id,
        gross_amount: parseInt(gross_amount)
      },
      item_details: [
        {
          id: service_code || 'TOPUP-GAME',
          price: parseInt(gross_amount),
          quantity: 1,
          name: `${item_name} (${user_id}${zone_id ? '-' + zone_id : ''})`
        }
      ],
      customer_details: {
        first_name: `Player ${user_id}`,
        phone: customer_phone
      },
      // Menyimpan metadata game agar bisa dibaca kembali oleh webhook saat pembayaran lunas
      custom_field1: service_code,
      custom_field2: user_id,
      custom_field3: zone_id || ''
    };

    const response = await axios.post(midtransUrl, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedKey}`
      }
    });

    return res.status(200).json({ token: response.data.token });
  } catch (error) {
    console.error('Midtrans Create Error:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Gagal membuat transaksi Midtrans' });
  }
};