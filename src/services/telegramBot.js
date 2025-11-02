import axios from 'axios';
import { supabase } from '../supabaseClient';

class TelegramBotService {
  constructor() {
    // Token is now handled by backend
  }

  // Send payment request message to customer via backend API
  async sendPaymentRequest(order) {
    try {
      if (!order.chat_id) {
        throw new Error('Chat ID not found for this order');
      }

      console.log('📤 Sending payment request to API...', { orderId: order.id, chatId: order.chat_id });

      // Call the backend API
      const response = await fetch('/api/send-payment-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order }),
      });

      console.log('📥 API Response status:', response.status);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('❌ Non-JSON response:', text);
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`);
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to send payment request');
      }

      console.log('✅ Payment request sent successfully');
      return result.data;
    } catch (error) {
      console.error('❌ Error sending payment request:', error);
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
      const fileId = photo[photo.length - 1].file_id;
      
      const response = await fetch('/api/process-screenshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chatId, fileId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process screenshot');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('❌ Error handling payment screenshot:', error);
      throw error;
    }
  }

  // Send message to user
  async sendMessage(chatId, text) {
    try {
      const response = await fetch('/api/send-telegram-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chatId, text }),
      });

      return await response.json();
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  // Notify admin about new payment
  async notifyAdminAboutPayment(order, imageUrl) {
    try {
      await fetch('/api/notify-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order, imageUrl }),
      });
    } catch (error) {
      console.error('❌ Error notifying admin:', error);
    }
  }

  // Handle text messages
  async handleTextMessage(chatId, text) {
    try {
      const lowerText = text.toLowerCase();
      
      if (lowerText.includes('статус') || lowerText.includes('/status')) {
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

  // Check if bot is configured
  isConfigured() {
    return true; // Backend handles token validation
  }
}

const telegramBotService = new TelegramBotService();
export default telegramBotService;