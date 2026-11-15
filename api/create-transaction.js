const axios = require('axios');

module.exports = async (req, res) => {
  // Mengizinkan akses dari domain Netlify kamu (CORS)
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
    const { order_id, gross_amount, item_name, customer_phone, user_id, zone_id } = req.body;

    // Mengambil Server Key dari Environment Variables Vercel
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const encodedKey = Buffer.from(`${serverKey}:`).toString('base64');

    // Gunakan URL Production (Ganti ke https://app.sandbox.midtrans.com/snap/v1/transactions jika masih mode Sandbox)
    const midtransUrl = 'https://app.midtrans.com/snap/v1/transactions';

    const payload = {
      transaction_details: {
        order_id: order_id,
        gross_amount: parseInt(gross_amount)
      },
      item_details: [
        {
          id: 'TOPUP-MLBB',
          price: parseInt(gross_amount),
          quantity: 1,
          name: `${item_name} (${user_id}-${zone_id})`
        }
      ],
      customer_details: {
        first_name: `Player ${user_id}`,
        phone: customer_phone
      }
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
    console.error('Midtrans Error:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Gagal membuat transaksi Midtrans' });
  }
};