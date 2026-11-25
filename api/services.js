import crypto from 'crypto';

export default async function handler(req, res) {
  // 1. ATUR HEADER CORS (Wajib agar tidak diblokir oleh faibstore.vercel.app)
  res.setHeader('Access-Control-Allow-Origin', 'https://faibstore.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 2. TANGANI PREFLIGHT REQUEST (Browser mengirim OPTIONS sebelum GET)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. AMBIL KREDENSIAL DARI ENVIRONMENT VARIABLES VERCEL
  const API_ID = process.env.VIP_API_ID;
  const API_KEY = process.env.VIP_API_KEY;

  if (!API_ID || !API_KEY) {
    return res.status(500).json({
      result: false,
      message: 'VIP_API_ID atau VIP_API_KEY belum diatur di Environment Variables Vercel.'
    });
  }

  // 4. BUAT SIGNATURE MD5 SESUAI DOKUMENTASI VIP RESELLER (md5(api_id + api_key))
  const sign = crypto
    .createHash('md5')
    .update(API_ID + API_KEY)
    .digest('hex');

  // Ambil parameter ?game=mobile-legends dari URL (default: Mobile Legends)
  const gameFilter = req.query.game || 'mobile-legends';

  try {
    // 5. KIRIM REQUEST KE SERVER VIP RESELLER
    const formData = new URLSearchParams();
    formData.append('key', API_KEY);
    formData.append('sign', sign);
    formData.append('type', 'services');
    formData.append('filter_type', 'game');
    formData.append('filter_value', gameFilter);

    const vipResponse = await fetch('https://vip-reseller.co.id/api/game-feature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const data = await vipResponse.json();

    // 6. KEMBALIKAN DATA KE FRONTEND (admin.html)
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      result: false,
      message: 'Gagal menghubungi server VIP Reseller: ' + error.message
    });
  }
}