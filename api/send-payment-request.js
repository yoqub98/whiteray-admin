export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 API: Received payment request');
    
    const { order } = req.body;

    if (!order) {
      return res.status(400).json({ error: 'Order data is required' });
    }

    // Get token from environment
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN not found in environment');
      return res.status(500).json({ error: 'Telegram bot token not configured' });
    }

    if (!order.chat_id) {
      return res.status(400).json({ error: 'Chat ID not found for this order' });
    }

    console.log('📤 Sending to Telegram:', { orderId: order.id, chatId: order.chat_id });

    // Parse order items
    let items = [];
    try {
      items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    } catch (e) {
      console.error('Failed to parse items:', e);
      return res.status(400).json({ error: 'Invalid order items format' });
    }

    // Format product list
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

    const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: order.chat_id,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Telegram API error:', result);
      return res.status(500).json({ 
        error: 'Failed to send message to Telegram',
        details: result.description || 'Unknown error'
      });
    }

    console.log('✅ Message sent successfully');
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('❌ API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to send payment request',
      details: error.message 
    });
  }
}