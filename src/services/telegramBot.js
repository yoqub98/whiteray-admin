class TelegramBotService {
  constructor() {
    // Remove token from frontend
  }

  async sendPaymentRequest(order) {
    try {
      if (!order.chat_id) {
        throw new Error('Chat ID not found for this order');
      }

      const response = await fetch('/api/send-payment-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send payment request');
      }

      return result.data;
    } catch (error) {
      console.error('❌ Error sending payment request:', error);
      throw error;
    }
  }

  isConfigured() {
    return true; // Backend will handle token validation
  }
}

const telegramBotService = new TelegramBotService();
export default telegramBotService;