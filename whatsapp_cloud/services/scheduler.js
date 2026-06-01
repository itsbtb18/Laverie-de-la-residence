const {
  sendReminderTemplate,
} = require('./whatsappService');

const REMINDER_POLL_MS = 60 * 1000;

async function fetchRemindersDue(config) {
  const response = await fetch(`${config.djangoApiUrl}/api/internal/whatsapp/reminders-due/`, {
    headers: {
      Authorization: `Bearer ${config.djangoApiKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Reminders API ${response.status}: ${body}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.reminders) ? payload.reminders : [];
}

async function markReminderSent(config, bookingId) {
  const response = await fetch(
    `${config.djangoApiUrl}/api/internal/whatsapp/reminders/${bookingId}/mark-sent/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.djangoApiKey}`,
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mark reminder ${bookingId} failed: ${response.status} ${body}`);
  }
}

function startReminderScheduler({ config, logger = console }) {
  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const reminders = await fetchRemindersDue(config);

      for (const reminder of reminders) {
        try {
          await sendReminderTemplate(
            reminder.phone,
            reminder.lastName || '',
            reminder.firstName || ''
          );
          await markReminderSent(config, reminder.id);
          logger.log(`[reminder] envoyé pour réservation #${reminder.id}`);
        } catch (error) {
          logger.error(`[reminder] échec #${reminder.id}:`, error.message);
        }
      }
    } catch (error) {
      logger.error('[reminder] polling error:', error.message);
    } finally {
      running = false;
    }
  };

  tick();
  const interval = setInterval(tick, REMINDER_POLL_MS);
  logger.log(`[reminder] scheduler actif (toutes les ${REMINDER_POLL_MS / 1000}s)`);

  return () => clearInterval(interval);
}

module.exports = { startReminderScheduler };
