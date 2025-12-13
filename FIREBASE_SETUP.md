# Configuración de Firebase

## Cómo obtener firebase-credentials.json

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto: **bot-whatsapp-13b37**
3. Haz clic en el ícono de engranaje ⚙️ (Project Settings)
4. Ve a la pestaña **"Service Accounts"**
5. Haz clic en **"Generate new private key"**
6. Se descargará un archivo JSON
7. **Renombra** el archivo a: `firebase-credentials.json`
8. **Colócalo** en la carpeta: `whatsapp-bot/`

## Estructura del archivo

El archivo `firebase-credentials.json` debe tener esta estructura:

```json
{
  "type": "service_account",
  "project_id": "bot-whatsapp-13b37",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@bot-whatsapp-13b37.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

## Verificación

Una vez que tengas el archivo, verifica que esté en la ubicación correcta:

```bash
cd whatsapp-bot
ls firebase-credentials.json  # Linux/Mac
dir firebase-credentials.json  # Windows
```

## Importante

- ⚠️ **NUNCA** subas este archivo a Git (ya está en .gitignore)
- ⚠️ **NUNCA** compartas este archivo públicamente
- ⚠️ Este archivo contiene credenciales de administrador de Firebase

## Solución de problemas

Si el bot muestra un error sobre el archivo:
- Verifica que el archivo se llame exactamente: `firebase-credentials.json`
- Verifica que esté en la carpeta `whatsapp-bot/` (no en subcarpetas)
- Verifica que el archivo tenga la estructura JSON correcta
- Verifica que el `project_id` en el archivo coincida con tu proyecto

