const crypto = require('crypto');
const axios = require('axios');

// Contoh implementasi Endpoint Backend untuk Sinkronisasi Harga Otomatis & Transaksi VIP Reseller
// Pastikan package 'axios' sudah di-install (npm install axios)

module.exports = async (req, res) => {
  // Hanya contoh struktur handler untuk Vercel Serverless / Express.js
  // Sesuaikan dengan router backend Anda (misal Express: app.get('/api/prices', ...))
  
  try {
    const apiId = process.env.VIP_API_ID;
    const apiKey = process.env.VIP_API_KEY;

    if (!apiId || !apiKey) {
      return res.status(500).json({ success: false, message: 'VIP_API_ID or VIP_API_KEY is not set in environment variables.' });
    }

    // Membuat tanda tangan digital (sign) menggunakan MD5 sesuai dokumentasi resmi VIPayment
    const sign = crypto.createHash('md5').update(apiId + apiKey).digest('hex');

    // Request daftar layanan / game dari server VIP Reseller
    const response = await axios.post('https://vip-reseller.co.id/api/game-feature', {
      key: apiKey,
      sign: sign,
      type: 'services'
    });

    if (response.data && response.data.result) {
      const rawServices = response.data.data;

      // Filter khusus Mobile Legends atau semua game, lalu tambahkan margin profit otomatis
      const processedCatalog = rawServices.map(item => {
        // Ambil harga modal H2H
        const modalH2H = item.price ? item.price.h2h : (item.price_h2h || 0); 
        const profitMargin = 2000; // Keuntungan bersih Anda per produk (bisa diubah sesuai keinginan)

        return {
          code: item.code,
          name: item.name,
          category: item.category,
          modal: modalH2H,
          price: modalH2H + profitMargin, // Harga jual otomatis di web Anda
          status: item.status
        };
      });

      return res.status(200).json({
        success: true,
        data: processedCatalog
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: response.data.message || 'Gagal mengambil data dari VIP Reseller' 
      });
    }
  } catch (error) {
    console.error('Error fetching VIP prices:', error.message);
    return res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};
