const crypto = require('crypto');
const axios = require('axios');

module.exports = async (req, res) => {
  try {
    const apiId = process.env.VIP_API_ID;
    const apiKey = process.env.VIP_API_KEY;

    if (!apiId || !apiKey) {
      return res.status(500).json({ success: false, message: 'API ID or API Key not set' });
    }

    // Sign MD5: md5(api_id + api_key)
    const sign = crypto.createHash('md5').update(apiId + apiKey).digest('hex');

    // Kirim request dengan format x-www-urlencoded atau JSON sesuai dokumentasi VIPayment
    const response = await axios.post('https://vip-reseller.co.id/api/game-feature', {
      key: apiKey,
      sign: sign,
      type: 'services'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.response?.data || error.message 
    });
  }
};