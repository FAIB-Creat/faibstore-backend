import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://faibstore.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const API_ID = process.env.VIP_API_ID;
  const API_KEY = process.env.VIP_API_KEY;

  if (!API_ID || !API_KEY) {
    return res.status(500).json({
      result: false,
      message: 'VIP_API_ID atau VIP_API_KEY belum diatur di Vercel.'
    });
  }

  const sign = crypto
    .createHash('md5')
    .update(API_ID + API_KEY)
    .digest('hex');

  try {
    const formData = new URLSearchParams();
    formData.append('key', API_KEY);
    formData.append('sign', sign);
    formData.append('type', 'services');
    formData.append('filter_type', 'game');
    formData.append('filter_value', 'Mobile Legends');

    const vipResponse = await fetch('https://vip-reseller.co.id/api/game-feature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const json = await vipResponse.json();

    if (!json.result || !Array.isArray(json.data)) {
      return res.status(200).json(json);
    }

    // 1. Filter HANYA "Mobile Legends A" dan "Mobile Legends B", status available, dan bukan SKU GLOBAL
    const validGames = ['mobile legends a', 'mobile legends b'];
    const filtered = json.data.filter((item) => {
      const gameName = (item.game || '').toLowerCase().trim();
      const code = (item.code || '').toUpperCase();
      return (
        validGames.includes(gameName) &&
        item.status === 'available' &&
        !code.includes('GLOBAL')
      );
    });

    // 2. Kelompokkan per nama produk (misal: "86 Diamonds", "Weekly Diamond Pass") dan ambil yang TERMURAH
    const cheapestMap = new Map();

    for (const item of filtered) {
      // Normalisasi nama produk agar "86 Diamonds" dari ML A dan ML B dibandingkan di grup yang sama
      const key = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
      const hargaModal = Number(item.price?.basic || item.price || 0);

      if (hargaModal <= 0) continue;

      if (!cheapestMap.has(key)) {
        cheapestMap.set(key, item);
      } else {
        const existing = cheapestMap.get(key);
        const existingPrice = Number(existing.price?.basic || existing.price || 0);
        if (hargaModal < existingPrice) {
          cheapestMap.set(key, item);
        }
      }
    }

    // Urutkan hasil dari harga termurah ke termahal
    const finalServices = Array.from(cheapestMap.values()).sort((a, b) => {
      const priceA = Number(a.price?.basic || a.price || 0);
      const priceB = Number(b.price?.basic || b.price || 0);
      return priceA - priceB;
    });

    return res.status(200).json({
      result: true,
      data: finalServices,
      message: `Berhasil mengambil ${finalServices.length} produk termurah dari ML A & ML B`
    });

  } catch (error) {
    return res.status(500).json({
      result: false,
      message: 'Error VIP Reseller: ' + error.message
    });
  }
}