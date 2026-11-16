const crypto = require('crypto');
const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const apiId = process.env.VIP_API_ID;
    const apiKey = process.env.VIP_API_KEY;

    if (!apiId || !apiKey) {
      return res.status(500).json({ success: false, message: 'API ID or API Key not set' });
    }

    const sign = crypto.createHash('md5').update(apiId + apiKey).digest('hex');

    // Menggunakan URLSearchParams agar terbaca sebagai form-urlencoded yang diminta VIP Reseller
    const params = new URLSearchParams();
    params.append('key', apiKey);
    params.append('sign', sign);
    params.append('type', 'services');

    const response = await axios.post('https://vip-reseller.co.id/api/game-feature', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.response?.data || error.message 
    });
  }
};