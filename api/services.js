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

    // 1. Filter HANYA Mobile Legends A & Mobile Legends B yang tersedia
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

    // Helper untuk memecah nama & keterangan dari format VIP Reseller
    // Contoh: "5 Diamonds (5 + 0 Bonus)" -> name: "5 Diamonds", note: "5 + 0 Bonus"
    const parseProduct = (rawName) => {
      let clean = rawName.replace(/^1x\s+/i, '').trim();
      let name = clean;
      let note = 'Server Indonesia • Instan';

      const match = clean.match(/^(.*?)\s*\((.*?)\)$/);
      if (match) {
        name = match[1].trim();
        note = match[2].trim();
      }
      // Seragamkan "150 Diamond" menjadi "150 Diamonds"
      name = name.replace(/\bDiamond\b(?!\s*Pass)/i, 'Diamonds');
      return { name, note };
    };

    // Helper untuk menentukan kategori otomatis
    const detectCategory = (name, price) => {
      const lower = name.toLowerCase();
      if (lower.includes('weekly') || lower.includes('monthly') || lower.includes('bundle')) {
        return 'WDP / Bundle';
      }
      if (lower.includes('pass')) {
        return 'Pass';
      }
      const diamondMatch = lower.match(/^(\d+)\s*diamonds/);
      if (diamondMatch) {
        const qty = parseInt(diamondMatch[1], 10);
        return qty < 100 ? 'Server ID' : 'Hemat';
      }
      return price < 30000 ? 'Server ID' : 'Hemat';
    };

    // 2. Bandingkan ML A vs ML B berdasarkan nama yang sudah dinormalisasi & ambil TERMURAH
    const cheapestMap = new Map();

    for (const item of filtered) {
      const hargaModal = Number(item.price?.basic || item.price || 0);
      if (hargaModal <= 0) continue;

      const { name, note } = parseProduct(item.name || '');
      const key = name.toLowerCase();

      const formattedItem = {
        sku: item.code,
        code: item.code,
        game: item.game,
        name: name,
        note: note,
        category: detectCategory(name, hargaModal),
        price: hargaModal,
        raw_name: item.name
      };

      if (!cheapestMap.has(key) || hargaModal < cheapestMap.get(key).price) {
        cheapestMap.set(key, formattedItem);
      }
    }

    // 3. Urutkan rapi: WDP/Bundle/Pass di paling atas, lalu Diamond dari terkecil ke terbesar
    const finalCatalog = Array.from(cheapestMap.values()).sort((a, b) => {
      const isSpecialA = a.category === 'WDP / Bundle' || a.category === 'Pass' ? 0 : 1;
      const isSpecialB = b.category === 'WDP / Bundle' || b.category === 'Pass' ? 0 : 1;
      if (isSpecialA !== isSpecialB) return isSpecialA - isSpecialB;
      return a.price - b.price;
    });

    return res.status(200).json({
      result: true,
      data: finalCatalog,
      message: `Berhasil memuat ${finalCatalog.length} produk termurah (ML A & ML B)`
    });

  } catch (error) {
    return res.status(500).json({
      result: false,
      message: 'Error VIP Reseller: ' + error.message
    });
  }
}