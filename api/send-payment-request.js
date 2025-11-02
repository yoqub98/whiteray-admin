import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { order } = req.body;

    // This reads from Vercel environment variables securely
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({ error: 'Telegram bot token not configured' });
    }

    if (!order.chat_id) {
      return res.status(400).json({ error: 'Chat ID not found' });
    }

    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    
    const productList = items.map(item => 
      `• ${item.quantity} x ${item.name} - ${item.price.toLocaleString('ru-RU')} сум`
    ).join('\n');

    const totalAmount = parseFloat(order.total_price).toLocaleString('ru-RU');

    const message = `
💳 *Запрос на оплату*

Ваш заказ №${order.order_number}

🛒 Заказанные товары:
${productList}

💰 Общая сумма: *${totalAmount} сум*

Для оплаты переведите сумму на карту:
💳 Uzcard: 5614 6822 0446 9599
💤 Владелец карты: ORIPOV BAKHTIYOR

После перевода, пожалуйста, отправьте сюда скриншот подтверждения оплаты.
    `.trim();

    const baseUrl = `https://api.telegram.org/bot${token}`;
    const response = await axios.post(`${baseUrl}/sendMessage`, {
      chat_id: order.chat_id,
      text: message,
      parse_mode: 'Markdown'
    });

    return res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Failed to send payment request',
      details: error.response?.data || error.message 
    });
  }
}