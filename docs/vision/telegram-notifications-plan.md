# Telegram Bot — New User Signup Notifications

## Context

Admin users currently have no way to know when a new user registers without manually checking the admin dashboard. Since the app uses an approval workflow (users register with `status: 'pending'`), timely notification is important so new users aren't left waiting. A Telegram bot provides instant mobile push notifications with zero ongoing cost.

**Branch requirement:** Must be implemented on `main`, not `directional_segmentation`.

## Scope

- Admin-only, read-only notifications
- Triggered only on new user registration
- No npm dependencies — uses Node.js built-in `fetch` (available since Node 18)
- Non-blocking: Telegram failures never break registration

## Implementation Plan

### Step 1: Switch to `main` branch

### Step 2: Create `src/services/TelegramService.js`

Simple service with one public method:

```javascript
class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.enabled = !!(this.botToken && this.chatId);
  }

  async notifyNewUser({ username, fullName, email, institution }) {
    if (!this.enabled) return;
    const message = `🆕 New user registration\n\nUsername: ${username}\nName: ${fullName}\nEmail: ${email}\nInstitution: ${institution}\n\nPlease review in the admin dashboard.`;
    try {
      await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text: message, parse_mode: 'HTML' })
      });
    } catch (err) {
      console.error('[TelegramService] Failed to send notification:', err.message);
    }
  }
}
```

- Gracefully disabled when env vars aren't set (no error, just skips)
- `try/catch` ensures registration never fails due to Telegram issues

### Step 3: Wire into app startup

In `server.js`, instantiate `TelegramService` and pass it to the auth routes via `src/app.js`.

**Files to modify:**
- `server.js` — create TelegramService instance (~2 lines)
- `src/app.js` — pass telegramService to route factory (~1 line)
- `src/routes/index.js` — forward to auth routes (~1 line)
- `src/routes/auth.routes.js` — accept telegramService, call `notifyNewUser()` after successful registration (~5 lines)

### Step 4: Update `.env` support

In `utils/envLoader.js`, add commented-out `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` placeholders to the auto-generated `.env` template so new installs see the options.

### Step 5: Add env vars to user's `.env`

Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (with placeholder values) to the existing `.env` file.

## Files Modified

| File | Change |
|------|--------|
| `src/services/TelegramService.js` | **New** — Telegram notification service |
| `server.js` | Instantiate TelegramService |
| `src/app.js` | Pass telegramService to routes |
| `src/routes/index.js` | Forward telegramService to auth routes |
| `src/routes/auth.routes.js` | Call `notifyNewUser()` after registration |
| `utils/envLoader.js` | Add Telegram env var placeholders |
| `.env` | Add bot token and chat ID |

## Setup Guide (for user)

After implementation, the user needs to:

1. **Create a bot:** Message @BotFather on Telegram → `/newbot` → follow prompts → copy the bot token
2. **Get chat ID:** Message the bot, then run:
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
   Find `"chat":{"id": 123456789}` in the response
3. **Set env vars:** Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```
4. **Restart the server**

## Manual Testing

1. Set up the bot and env vars as described above
2. Restart the server on `main` branch
3. Open the app and register a new user account
4. Verify a Telegram message arrives with the user's details
5. Verify registration still succeeds if you temporarily set an invalid bot token (fault tolerance)
6. Verify registration works normally when env vars are unset (graceful disable)
