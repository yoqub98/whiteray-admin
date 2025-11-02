import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📨 Webhook received:', JSON.stringify(req.body, null, 2));

    const update = req.body;
    const message = update.message;

    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const photo = message.photo;

    // Handle photo (payment screenshot)
    if (photo && photo.length > 0) {
      await handlePaymentScreenshot(chatId, photo);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handlePaymentScreenshot(chatId, photo) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      throw new Error('Telegram bot token not configured');
    }

    // Get the highest resolution photo
    const fileId = photo[photo.length - 1].file_id;
    
    console.log('📸 Processing screenshot:', { chatId, fileId });

    // Get file info from Telegram
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    );
    const fileData = await fileResponse.json();

    if (!fileData.ok) {
      throw new Error('Failed to get file info from Telegram');
    }

    const filePath = fileData.result.file_path;
    const imageUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    console.log('🖼️ Image URL:', imageUrl);

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
    );

    // Find the most recent order for this chat_id
    const { data: orders, error: findError } = await supabase
      .from('orders')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (findError) {
      console.error('❌ Error finding order:', findError);
      throw findError;
    }

    if (!orders || orders.length === 0) {
      console.log('❌ No order found for chat_id:', chatId);
      await sendTelegramMessage(
        chatId,
        '❌ Не удалось найти ваш заказ. Пожалуйста, свяжитесь с поддержкой.',
        token
      );
      return;
    }

    const order = orders[0];

    // Update order with payment screenshot
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_screenshot: imageUrl,
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('❌ Error updating order:', updateError);
      throw updateError;
    }

    console.log('✅ Payment screenshot saved for order:', order.order_number);

    // Send confirmation to user
    await sendTelegramMessage(
      chatId,
      '✅ Спасибо! Скриншот оплаты получен. Мы проверим его и подтвердим оплату в ближайшее время.\n\nВаш заказ будет обработан в кратчайшие сроки!',
      token
    );

    // Notify admin (optional)
    const adminChatId = process.env.ADMIN_CHAT_ID;
    if (adminChatId) {
      await sendTelegramMessage(
        adminChatId,
        `💰 *Новая оплата получена!*

Заказ №${order.order_number}
Клиент: ${order.client_name}
Телефон: ${order.phone}
Сумма: ${parseFloat(order.total_price).toLocaleString('ru-RU')} сум

Скриншот: ${imageUrl}`,
        token
      );
    }

    return { success: true, orderId: order.id };
  } catch (error) {
    console.error('❌ Error handling payment screenshot:', error);
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      await sendTelegramMessage(
        chatId,
        '❌ Произошла ошибка при обработке скриншота. Пожалуйста, свяжитесь с поддержкой.',
        token
      );
    }
    
    throw error;
  }
}

async function sendTelegramMessage(chatId, text, token) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('❌ Error sending message:', error);
  }
}