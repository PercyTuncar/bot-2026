# Bot de WhatsApp

Bot de WhatsApp empresarial con sistema de gamificación mediante puntos, niveles, gestión de grupos, recompensas configurables y moderación automática.

## 🚀 Instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Configurar variables de entorno:**
```bash
cp .env.example .env
# Editar .env con tus valores
```

3. **Configurar Firebase:**
   - Descargar credenciales de Firebase
   - Guardar como `firebase-credentials.json` en la raíz del proyecto

4. **Migrar base de datos (IMPORTANTE):**
```bash
npm run migrate
```
   - Esto asegura que tu base de datos cumple con la especificación
   - Solo necesitas ejecutarlo una vez

5. **Verificar cumplimiento:**
```bash
npm run verify
```
   - Debe mostrar: `✅ DATABASE IS FULLY COMPLIANT WITH SPEC!`

6. **Iniciar bot:**
```bash
npm start
```

7. **Escanear QR code** que aparece en la terminal

## 📋 Comandos NPM

### Ejecución
- `npm start` - Iniciar bot en modo normal
- `npm run dev` - Iniciar con nodemon (desarrollo)

### PM2 (Producción)
- `npm run pm2:start` - Iniciar con PM2
- `npm run pm2:stop` - Detener bot
- `npm run pm2:restart` - Reiniciar bot
- `npm run pm2:logs` - Ver logs en tiempo real
- `npm run pm2:monit` - Monitorear recursos

### Migración de Base de Datos
- `npm run migrate` - ⭐ **Ejecutar TODAS las migraciones**
- `npm run migrate:config` - Migrar config a inline
- `npm run migrate:members` - Agregar campos faltantes a miembros
- `npm run migrate:rewards` - Renombrar prizes → rewards
- `npm run verify` - 🔍 **Verificar cumplimiento con SPEC**

### Mantenimiento y Limpieza
- `npm run clean:lids` - 🧹 **Eliminar miembros duplicados por LIDs** (simulación)
- `npm run clean:lids -- --execute` - Ejecutar limpieza real

## 📚 Documentación

- **[DATABASE_MODEL.md](./DATABASE_MODEL.md)** - Estructura completa de la base de datos
- **[DATABASE_COMPLIANCE_CHECKLIST.md](./DATABASE_COMPLIANCE_CHECKLIST.md)** - Lista de verificación paso a paso
- **[DATABASE_COMPLIANCE_SUMMARY.md](./DATABASE_COMPLIANCE_SUMMARY.md)** - Resumen de cambios implementados
- **[project_documentation.md](./project_documentation.md)** - Especificación técnica completa

## 🎮 Uso del Bot

### Comandos de Usuario
- `.ping` - Verificar latencia del bot
- `.help` - Ver todos los comandos disponibles
- `.points` - Ver tus puntos actuales
- `.level` - Ver tu nivel y progreso
- `.profile` - Ver perfil completo con estadísticas
- `.rank` - Ver top 10 usuarios del grupo
- `.rewards` - Ver recompensas disponibles
- `.redeem <id>` - Canjear una recompensa
- `.myredemptions` - Ver tus canjes (pendientes, aprobados, entregados)

### Comandos de Admin
- `.warn @usuario razón` - Advertir a un usuario
- `.unwarn @usuario` - Remover advertencia
- `.kick @usuario` - Expulsar usuario
- `.ban @usuario` - Banear usuario
- `.tagall mensaje` - Mencionar a todos
- `.addpoints @usuario cantidad` - Agregar puntos
- `.setlevel @usuario nivel` - Cambiar nivel
- `.antilink on/off` - Activar/desactivar anti-enlaces
- `.addword palabra` - Agregar palabra prohibida
- `.setprefix .` - Cambiar prefijo de comandos

### Comandos de SuperAdmin
- `.listgroups` - Ver todos los grupos
- `.bot on <id>` - Activar bot en un grupo
- `.bot off <id>` - Desactivar bot en un grupo

## 🗄️ Estructura de Base de Datos

La base de datos sigue estrictamente la especificación definida en `project_documentation.md`:

```
Firestore
├── bot_config/settings              # Configuración global
├── groups/{groupId}                 # Documentos de grupos
│   ├── config (inline object)       # ⚠️ Inline, NO subcollection
│   ├── members/{phone}              # Miembros del grupo
│   ├── messages/{messageId}         # Mensajes registrados
│   ├── rewards/{rewardId}           # Recompensas del grupo
│   └── redemptions/{redemptionId}   # Canjes de recompensas
```

**Importante:** Después de instalar, ejecuta `npm run migrate` para asegurar cumplimiento.

## 🔧 Producción

Usar PM2:
```bash
npm run pm2:start
```

