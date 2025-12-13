# Arquitectura del Sistema
## Capas
1. Core: cliente WhatsApp y manejo de eventos.
2. Servicios: lógica de negocio y orquestación.
3. Repositorios: acceso a Firestore.
4. Comandos: acciones ejecutables por el usuario.
5. Utils/Lib: utilidades y logger.

## Flujo de eventos
1. `Client` inicializa y emite `ready`.
2. `message`/`message_create` → `EventHandler.handleMessage`.
3. `MessageRouter` detecta comando y contexto.
4. `CommandDispatcher` valida permisos/cooldown/puntos y ejecuta.
5. Servicios interactúan con repositorios.

## Dependencia de whatsapp-web.js
Se usa exclusivamente la API documentada para:
- Inicialización y autenticación.
- Lectura de chats/contactos/participantes.
- Envío de mensajes y menciones.

