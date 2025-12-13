# Guía de Solución de Problemas

## Errores Comunes y Soluciones

### 1. Error de PM2: `spawn wmic ENOENT`

**Síntoma:**
```
PM2 | Error caught while calling pidusage
PM2 | Error: Error: spawn wmic ENOENT
```

**Causa:**
Este error ocurre en Windows cuando PM2 intenta usar `wmic` (Windows Management Instrumentation Command) para obtener estadísticas del proceso. En versiones recientes de Windows (10/11), `wmic` ha sido deprecado o no está disponible en el PATH.

**Solución:**
Este error **NO afecta la funcionalidad del bot**. Es solo un problema de monitoreo de PM2. Puedes ignorarlo de forma segura.

Si quieres suprimir estos errores:

1. **Opción 1: Actualizar PM2** (Recomendado)
   ```bash
   npm install -g pm2@latest
   ```

2. **Opción 2: Ignorar en logs**
   Los errores ya están configurados para no afectar el funcionamiento del bot.

3. **Opción 3: Usar variables de entorno**
   ```bash
   set PM2_GRACEFUL_TIMEOUT=10000
   ```

### 2. Mensajes Duplicados en Logs

**Síntoma:**
Los mensajes aparecen dos veces en los logs:
```
💬 Mensaje de 120363421200244245 (grupo): "Yo"
💬 Mensaje de 120363421200244245 (grupo): "Yo"
```

**Causa:**
WhatsApp Web emite eventos tanto `message` como `message_create` para el mismo mensaje.

**Solución:**
✅ **Ya corregido**: Se implementó un sistema de deduplicación que evita procesar el mismo mensaje dos veces usando el ID único del mensaje.

### 3. El Bot No Responde a Comandos

**Posibles causas:**

1. **Grupo no activado**
   - Solución: Usar `.bot on` en el grupo

2. **Prefijo incorrecto**
   - Verificar que el comando empiece con `.` (punto)
   - Verificar configuración en `.env`: `COMMAND_PREFIX=.`

3. **Permisos insuficientes**
   - Verificar que el usuario tenga los permisos necesarios
   - Verificar configuración de `OWNER_PHONE` y `ADMIN_PHONES` en `.env`

### 4. Los Puntos No Se Acumulan

**Posibles causas:**

1. **Sistema de puntos desactivado**
   - Verificar `.env`: `POINTS_ENABLED=true`

2. **Grupo no activo**
   - Verificar que el grupo esté activo con `.bot on`

3. **Mensajes no válidos**
   - Solo cuentan mensajes de texto con al menos 3 caracteres
   - Los comandos (que empiezan con `.`) no cuentan
   - Stickers, audios, imágenes no cuentan

4. **Rate limiting activo**
   - Máximo 1 punto cada 10 segundos
   - Si envías 5+ mensajes en 1 segundo, no cuentan (anti-flood)

### 5. Error de Conexión a Firebase

**Síntoma:**
```
Error: Failed to initialize Firebase
```

**Solución:**
1. Verificar que `firebase-credentials.json` existe y es válido
2. Verificar que `FIREBASE_PROJECT_ID` en `.env` es correcto
3. Verificar que las credenciales tienen permisos en Firestore

### 6. QR Code No Aparece

**Síntoma:**
El bot inicia pero no muestra el código QR.

**Solución:**
1. Verificar que la terminal soporta caracteres especiales
2. Verificar logs en `logs/combined.log`
3. Si usas PM2, ver logs con: `pm2 logs whatsapp-bot`

### 7. Sesión de WhatsApp Se Pierde

**Síntoma:**
El bot requiere escanear QR cada vez que se reinicia.

**Solución:**
1. Verificar que `.wwebjs_auth/` existe y tiene permisos de escritura
2. No eliminar la carpeta `.wwebjs_auth/` entre reinicios
3. Hacer backup de `.wwebjs_auth/` antes de actualizaciones

## Logs y Debugging

### Ver Logs en Tiempo Real
```bash
# Con PM2
pm2 logs whatsapp-bot

# Sin PM2
tail -f logs/combined.log
```

### Niveles de Log
Configurar en `.env`:
```
LOG_LEVEL=debug  # debug, info, warn, error
```

### Archivos de Log
- `logs/combined.log` - Todos los logs
- `logs/error.log` - Solo errores
- `logs/bot-activity.log` - Actividad del bot
- `logs/pm2-out.log` - Salida de PM2
- `logs/pm2-error.log` - Errores de PM2

## Contacto y Soporte

Si encuentras otros problemas:
1. Revisar los logs en `logs/`
2. Verificar la configuración en `.env`
3. Consultar el PRD.md para detalles de funcionalidades
4. Verificar que todas las dependencias estén instaladas: `npm install`

