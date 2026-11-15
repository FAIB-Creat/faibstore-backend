const axios = require('axios');
const crypto = require('crypto');

const VIP_API_ID = process.env.VIP_API_ID;
const VIP_API_KEY = process.env.VIP_API_KEY;
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const notification = req.body;
    const {
      order_id,
      transaction_status,
      fraud_status,
      custom_field1: service_code,
      custom_field2: user_id,
      custom_field3: zone_id
    } = notification;

    console.log(`Webhook masuk untuk Order: ${order_id} | Status: ${transaction_status}`);

    // Cek apakah pembayaran sudah benar-benar lunas
    const isPaid =
      (transaction_status === 'capture' && fraud_status === 'accept') ||
      transaction_status === 'settlement';

    if (isPaid) {
      // 1. Buat Signature MD5 untuk VIP Reseller
      const sign = crypto
        .createHash('md5')
        .update(VIP_API_ID + VIP_API_KEY)
        .digest('hex');

      // 2. Tembak API Order ke VIP Reseller
      const vipFormData = new URLSearchParams();
      vipFormData.append('key', VIP_API_KEY);
      vipFormData.append('sign', sign);
      vipFormData.append('type', 'order');
      vipFormData.append('service', service_code);
      vipFormData.append('data_no', user_id);
      if (zone_id) {
        vipFormData.append('data_zone', zone_id);
      }

      const vipResponse = await axios.post('https://vip-reseller.co.id/api/game-feature', vipFormData);
      console.log('Respon VIP Reseller:', vipResponse.data);

      // 3. Update Status Pesanan di Firebase Firestore (REST API)
      const orderStatus = vipResponse.data.result ? 'SUCCESS' : 'FAILED_VIP';
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/orders/${order_id}?updateMask.fieldPaths=status&updateMask.fieldPaths=vip_trxid&key=${FIREBASE_API_KEY}`;

      await axios.patch(firestoreUrl, {
        fields: {
          status: { stringValue: orderStatus },
          vip_trxid: { stringValue: vipResponse.data.data?.trxid || '-' }
        }
      });
    }

    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('Webhook Error:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: error.message });
  }
};