# Compatibilidad con whatsapp-web.js
## Checklist
- Sin uso de `pupPage.evaluate` ni `window.Store`.
- `sendMessage(chatId, string, options)` únicamente.
- Menciones: texto con `@id` y `options.mentions` con JIDs/Contacts.
- Lectura de chats y contactos: `getChatById`, `getContactById`, `msg.getChat()`.
- Eventos usados: `qr`, `ready`, `authenticated`, `auth_failure`, `disconnected`, `message`, `message_create`.

## Verificación
- Greps para `pupPage`, `window.Store`, y `sendMessage` con objetos.
- Pruebas funcionales de comandos clave.

