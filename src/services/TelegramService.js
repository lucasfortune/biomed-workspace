/**
 * TelegramService - Sends notifications via Telegram Bot API
 *
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.
 * Gracefully disabled when env vars are not set.
 */
class TelegramService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = !!(this.botToken && this.chatId);

        if (this.enabled) {
            console.log('[TelegramService] Notifications enabled');
        } else {
            console.log('[TelegramService] Notifications disabled (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set)');
        }
    }

    async notifyNewUser({ username, fullName, email, institution }) {
        if (!this.enabled) return;

        const message = [
            '\u{1F195} New user registration',
            '',
            `Username: ${username}`,
            `Name: ${fullName}`,
            `Email: ${email}`,
            `Institution: ${institution}`,
            '',
            'Please review in the admin dashboard.'
        ].join('\n');

        try {
            const response = await fetch(
                `https://api.telegram.org/bot${this.botToken}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: this.chatId,
                        text: message
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.text();
                console.error('[TelegramService] API error:', response.status, errorData);
            }
        } catch (err) {
            console.error('[TelegramService] Failed to send notification:', err.message);
        }
    }
}

module.exports = TelegramService;
