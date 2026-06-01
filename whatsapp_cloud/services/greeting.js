/**
 * Salutation selon l'heure locale Algérie (Africa/Algiers).
 */
function getGreetingByAlgeriaTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Algiers',
    hour: '2-digit',
    hour12: false,
  });

  const hour = Number(formatter.format(date));
  if (hour >= 5 && hour < 18) {
    return 'Bonjour';
  }

  return 'Bonsoir';
}

module.exports = { getGreetingByAlgeriaTime };
