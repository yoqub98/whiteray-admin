import axios from 'axios';
import { supabase } from '../supabaseClient';

class TelegramBotService {
  constructor() {
    this.token = process.env.REACT_APP_TELEGRAM_BOT_TOKEN;
    if (!this.token) {
      console.error('❌ Telegram Bot Token not found in environment variables');
    }
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  // Send payment request message to customer
  async sendPaymentRequest(order) {
    try {
      if (!order.chat_id) {
        throw new Error('Chat ID not found for this order');
      }

      if (!this.token) {
        throw new Error('Telegram bot token not configured');
      }

      // Parse order items
      const items = this.parseOrderItems(order.items);
      
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
👤 Владелец карты: ORIPOV BAKHTIYOR

После перевода, пожалуйста, отправьте сюда скриншот подтверждения оплаты.
      `.trim();

      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: order.chat_id,
        text: message,
        parse_mode: 'Markdown'
      });

      console.log('✅ Payment request sent successfully');
      return response.data;
    } catch (error) {
      console.error('❌ Error sending payment request:', error.response?.data || error.message);
      throw error;
    }
  }

  // Handle incoming messages (for webhook)
  async handleIncomingMessage(update) {
    try {
      const message = update.message;
      if (!message) return;

      const chatId = message.chat.id;
      const text = message.text;
      const photo = message.photo;

      console.log('📨 Incoming message:', { chatId, text, hasPhoto: !!photo });

      // Handle photo (screenshot)
      if (photo && photo.length > 0) {
        await this.handlePaymentScreenshot(chatId, photo);
      } else if (text) {
        await this.handleTextMessage(chatId, text);
      }
    } catch (error) {
      console.error('❌ Error handling incoming message:', error);
    }
  }

  // Handle payment screenshot
  async handlePaymentScreenshot(chatId, photo) {
    try {
      // Get the highest resolution photo
      const fileId = photo[photo.length - 1].file_id;
      
      // Get file info to get the file path
      const fileResponse = await axios.get(`${this.baseUrl}/getFile?file_id=${fileId}`);
      const filePath = fileResponse.data.result.file_path;
      
      // Construct the direct URL to the image
      const imageUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;

      console.log('📸 Processing payment screenshot:', { chatId, fileId, imageUrl });

      // Find order by chat_id
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
        await this.sendMessage(chatId, '❌ Не удалось найти ваш заказ. Пожалуйста, свяжитесь с поддержкой.');
        return;
      }

      const order = orders[0];

      // Update order with payment screenshot
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_screenshot: imageUrl,
          payment_status: 'paid', // Auto-update payment status
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (updateError) {
        console.error('❌ Error updating order:', updateError);
        throw updateError;
      }

      console.log('✅ Payment screenshot saved for order:', order.order_number);

      // Send confirmation to user
      await this.sendMessage(
        chatId,
        '✅ Спасибо! Скриншот оплаты получен. Мы проверим его и подтвердим оплату в ближайшее время.\n\nВаш заказ будет обработан в кратчайшие сроки!'
      );

      // Notify admin (optional)
      await this.notifyAdminAboutPayment(order, imageUrl);

      return { fileId, imageUrl, orderId: order.id };
    } catch (error) {
      console.error('❌ Error handling payment screenshot:', error);
      await this.sendMessage(
        chatId,
        '❌ Произошла ошибка при обработке скриншота. Пожалуйста, свяжитесь с поддержкой.'
      );
      throw error;
    }
  }

  // Send message to user
  async sendMessage(chatId, text) {
    try {
      await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('❌ Error sending message:', error);
    }
  }

  // Notify admin about new payment (optional)
  async notifyAdminAboutPayment(order, imageUrl) {
    try {
      // Replace with your admin chat ID
      const adminChatId = process.env.REACT_APP_ADMIN_CHAT_ID;
      
      if (!adminChatId) return;

      const message = `
💰 *Новая оплата получена!*

Заказ №${order.order_number}
Клиент: ${order.client_name}
Телефон: ${order.phone}
Сумма: ${parseFloat(order.total_price).toLocaleString('ru-RU')} сум

Скриншот: ${imageUrl}
      `.trim();

      await this.sendMessage(adminChatId, message);
    } catch (error) {
      console.error('❌ Error notifying admin:', error);
    }
  }

  // Handle text messages
  async handleTextMessage(chatId, text) {
    try {
      // Basic responses
      const lowerText = text.toLowerCase();
      
      if (lowerText.includes('статус') || lowerText.includes('/status')) {
        // Find user's latest order
        const { data: orders, error } = await supabase
          .from('orders')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error || !orders || orders.length === 0) {
          await this.sendMessage(
            chatId,
            '❌ Не удалось найти ваши заказы. Если у вас есть вопросы, свяжитесь с поддержкой.'
          );
          return;
        }

        const order = orders[0];
        const statusConfig = this.getDeliveryStatusConfig(order.delivery_status);
        const paymentConfig = this.getPaymentStatusConfig(order.payment_status);

        const statusMessage = `
📦 *Статус вашего заказа*

Заказ №${order.order_number}
Статус доставки: ${statusConfig.text} ${statusConfig.icon}
Статус оплаты: ${paymentConfig.text}
Сумма: ${parseFloat(order.total_price).toLocaleString('ru-RU')} сум

Для уточнения деталей вы можете связаться с поддержкой.
        `.trim();

        await this.sendMessage(chatId, statusMessage);
      } else if (lowerText.includes('помощь') || lowerText.includes('/help')) {
        await this.sendMessage(
          chatId,
          `🤖 *Доступные команды:*

/status - Проверить статус заказа
/help - Показать справку

💳 *Для оплаты:*
Отправьте скриншот подтверждения оплаты, и мы автоматически обновим статус вашего заказа.

📞 *Поддержка:*
Свяжитесь с нами для любых вопросов.`
        );
      } else {
        // Default response for other messages
        await this.sendMessage(
          chatId,
          `Привет! 👋 Я бот для обработки оплат.\n\nОтправьте скриншот подтверждения оплаты, и я автоматически обновлю статус вашего заказа.\n\nИспользуйте /status для проверки статуса заказа или /help для справки.`
        );
      }
    } catch (error) {
      console.error('❌ Error handling text message:', error);
      await this.sendMessage(
        chatId,
        '❌ Произошла ошибка. Пожалуйста, попробуйте позже или свяжитесь с поддержкой.'
      );
    }
  }

  // Set webhook
  async setWebhook(url) {
    try {
      const response = await axios.post(`${this.baseUrl}/setWebhook`, {
        url: url
      });
      console.log('✅ Webhook set successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error setting webhook:', error);
      throw error;
    }
  }

  // Delete webhook
  async deleteWebhook() {
    try {
      const response = await axios.post(`${this.baseUrl}/deleteWebhook`);
      console.log('✅ Webhook deleted successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting webhook:', error);
      throw error;
    }
  }

  // Get webhook info
  async getWebhookInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/getWebhookInfo`);
      return response.data;
    } catch (error) {
      console.error('❌ Error getting webhook info:', error);
      throw error;
    }
  }

  // Parse order items
  parseOrderItems(items) {
    try {
      if (typeof items === 'string') {
        return JSON.parse(items);
      } else if (Array.isArray(items)) {
        return items;
      }
      return [];
    } catch (error) {
      console.error('Error parsing order items:', error);
      return [];
    }
  }

  // Helper functions for status configs
  getDeliveryStatusConfig(status) {
    const configs = {
      new: { text: 'Новый', icon: '⏳' },
      processing: { text: 'В обработке', icon: '🔄' },
      delivering: { text: 'Доставляется', icon: '🚚' },
      completed: { text: 'Завершен', icon: '✅' },
      cancelled: { text: 'Отменен', icon: '❌' },
    };
    return configs[status] || configs.new;
  }

  getPaymentStatusConfig(status) {
    const configs = {
      pending: { text: 'Ожидает оплаты', icon: '⏳' },
      paid: { text: 'Оплачен', icon: '✅' },
      failed: { text: 'Ошибка оплаты', icon: '❌' },
    };
    return configs[status] || configs.pending;
  }

  // Check if bot token is available
  isConfigured() {
    return !!this.token;
  }
}

// Create a singleton instance
const telegramBotService = new TelegramBotService();
export default telegramBotService;