export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({ error: 'Telegram bot token not configured' });
  }

  if (req.method === 'POST') {
    // Set webhook
    try {
      const { webhookUrl } = req.body;
      
      if (!webhookUrl) {
        return res.status(400).json({ error: 'Webhook URL is required' });
      }

      const response = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: webhookUrl
          })
        }
      );

      const result = await response.json();
      console.log('✅ Webhook set:', result);
      
      return res.status(200).json(result);
    } catch (error) {
      console.error('❌ Error setting webhook:', error);
      return res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'GET') {
    // Get webhook info
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getWebhookInfo`
      );
      const result = await response.json();
      
      return res.status(200).json(result);
    } catch (error) {
      console.error('❌ Error getting webhook info:', error);
      return res.status(500).json({ error: error.message });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}