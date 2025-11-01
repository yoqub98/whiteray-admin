import telegramBotService from '../services/telegramBot';

export const setupWebhook = async () => {
  try {
    // Get the current domain (for Vercel deployments)
    const domain = window.location.origin;
    const webhookUrl = `${domain}/api/telegram-webhook`;
    
    console.log('🔧 Setting up webhook:', webhookUrl);
    
    const response = await fetch('/api/set-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ webhookUrl }),
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Webhook set up successfully');
    } else {
      console.error('❌ Failed to set up webhook:', result);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error setting up webhook:', error);
    return { error: error.message };
  }
};

// Check webhook status
export const getWebhookStatus = async () => {
  try {
    const response = await fetch('/api/set-webhook');
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('❌ Error getting webhook status:', error);
    return { error: error.message };
  }
};