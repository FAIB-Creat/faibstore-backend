const axios = require('axios');

const ALLOWED_ORIGINS = [
  'https://faibstore.vercel.app',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://faibstore.netlify.app');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      order_id,
      gross_amount,
      item_name,
      customer_phone,
      user_id,
      zone_id,
      service_code
    } = req.body || {};

    const amount = parseInt(gross_amount, 10);
    if (!order_id || isNaN(amount) || amount < 100) {
      return res.status(400).json({ error: 'Data order_id atau gross_amount tidak valid' });
    }

    const serverKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();
    if (!serverKey) {
      return res.status(500).json({ error: 'MIDTRANS_SERVER_KEY belum diatur di Vercel' });
    }

    const encodedKey = Buffer.from(`${serverKey}:`).toString('base64');

    // Otomatis pakai endpoint Sandbox jika key diawali 'SB-', selain itu Production
    const isSandbox = serverKey.startsWith('SB-');
    const midtransUrl = isSandbox
      ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
      : 'https://app.midtrans.com/snap/v1/transactions';

    const targetSuffix = user_id ? ` (${user_id}${zone_id ? '-' + zone_id : ''})` : '';
    const rawItemName = `${item_name || 'Top-Up MLBB'}${targetSuffix}`;
    // Midtrans membatasi item_details.name maksimal 50 karakter
    const safeItemName = rawItemName.slice(0, 50);

    const payload = {
      transaction_details: {
        order_id: String(order_id).slice(0, 50),
        gross_amount: amount
      },
      item_details: [
        {
          id: String(service_code || 'TOPUP-GAME').slice(0, 50),
          price: amount,
          quantity: 1,
          name: safeItemName
        }
      ],
      customer_details: {
        first_name: `Player ${user_id || 'MLBB'}`.slice(0, 50),
        phone: String(customer_phone || '').slice(0, 20)
      },
      custom_field1: String(service_code || '').slice(0, 255),
      custom_field2: String(user_id || '').slice(0, 255),
      custom_field3: String(zone_id || '').slice(0, 255)
    };

    const response = await axios.post(midtransUrl, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedKey}`
      },
      timeout: 10000
    });

    return res.status(200).json({
      token: response.data.token,
      redirect_url: response.data.redirect_url
    });
  } catch (error) {
    const detail = error.response ? error.response.data : error.message;
    console.error('Midtrans Create Error:', detail);
    const msg =
      (error.response && error.response.data && Array.isArray(error.response.data.error_messages)
        ? error.response.data.error_messages.join(', ')
        : null) || 'Gagal membuat transaksi Midtrans';
    return res.status(500).json({ error: msg });
  }
};