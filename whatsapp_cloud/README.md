# WhatsApp Cloud API (Meta) — Chrono DZ

Service Node.js qui envoie les messages via l’**API officielle WhatsApp Business (Meta)**.  
Remplace l’ancien bot `whatsapp-web.js` / `chrono_whatsapp_bot`.

## Démarrage

```bash
cd whatsapp_cloud
npm install
npm start
```

Le service charge les variables depuis `whatsapp_cloud/.env` puis `../.env` (racine du projet Django).

## Variables d’environnement

À définir dans le `.env` **racine** (partagé avec Django) :

| Variable | Description |
|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Token permanent Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ID du numéro WhatsApp Business |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID du compte Business (référence) |
| `WHATSAPP_TEMPLATE_WELCOME` | Nom du template création compte |
| `WHATSAPP_TEMPLATE_CONFIRMATION` | Nom du template confirmation RDV |
| `WHATSAPP_TEMPLATE_REMINDER` | Nom du template rappel 30 min |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Code langue (`fr`) |
| `WHATSAPP_SERVICE_PORT` | Port HTTP (défaut `5000`) |
| `DJANGO_API_KEY` | Clé partagée avec Django |
| `DJANGO_API_URL` | URL Django (`http://127.0.0.1:8000`) |
| `CUSTOMER_SITE_URL` | Lien site client dans le template bienvenue |

## Templates Meta (ordre des variables `body`)

Configurez dans Meta Business Manager des templates **utilitaires** avec ce nombre de variables :

### `WHATSAPP_TEMPLATE_WELCOME` (6 variables)

1. Salutation — `Bonjour` / `Bonsoir` (fuseau `Africa/Algiers`)
2. Prénom
3. Nom
4. Téléphone
5. Code secret
6. Lien du site

Puis un **2ᵉ message** image : QR généré automatiquement (upload Media API) ou URL / ID média fourni.

### `WHATSAPP_TEMPLATE_CONFIRMATION` (6 variables)

1. Salutation  
2. Prénom  
3. Nom  
4. Mode de lavage  
5. Date (formatée en français)  
6. Heure  

### `WHATSAPP_TEMPLATE_REMINDER` (3 variables)

1. Salutation  
2. Prénom  
3. Nom  

## Endpoints HTTP (appelés par Django)

Authentification : `Authorization: Bearer <DJANGO_API_KEY>`

| Méthode | Route | Rôle |
|---------|-------|------|
| `GET` | `/health` | Santé du service |
| `POST` | `/api/v1/whatsapp/welcome` | Création compte + QR |
| `POST` | `/api/v1/whatsapp/confirmation` | Confirmation RDV |
| `POST` | `/api/v1/whatsapp/reminder` | Rappel manuel |

## Rappels automatiques (30 min)

Le **scheduler** intégré interroge Django chaque minute :

- `GET /api/internal/whatsapp/reminders-due/`
- envoi `sendReminderTemplate` via Meta
- `POST /api/internal/whatsapp/reminders/<id>/mark-sent/`

## Format téléphone

Envoi vers Meta au format **chiffres uniquement, sans `+`** : `2135XXXXXXXX` (Algérie).
