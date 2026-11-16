const crypto = require('crypto');
const axios = require('axios');

module.exports = async (req, res) => {
  try {
    const apiId = process.env.VIP_API_ID;
    const apiKey = process.env.VIP_API_KEY;

    if (!apiId || !apiKey) {
      return res.status(500).json({ 
        success: false, 
        message: 'VIP_API_ID or VIP_API_KEY is not set in environment variables.' 
      });
    }

    // Membuat tanda tangan digital (sign) menggunakan MD5: md5(api_id + api_key)
    const sign = crypto.createHash('md5').update(apiId + apiKey).digest('hex');

    // Request ke endpoint game-feature VIP Reseller dengan parameter lengkap
    const response = await axios.post('https://vip-reseller.co.id/api/game-feature', {
      key: apiKey,
      sign: sign,
      type: 'services'
    });

    // Cek respons dari VIP Reseller
    if (response.data) {
      return res.status(200).json(response.data);
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Respon kosong dari server VIP Reseller' 
      });
    }

  } catch (error) {
    console.error('Error fetching VIP prices:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error', 
      error: error.response?.data || error.message 
    });
  }
};