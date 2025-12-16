# 🚀 Guía de Deploy en AWS EC2

Esta guía te ayudará a deployar el bot de WhatsApp en AWS EC2 usando PM2 para gestión de procesos.

## 📋 Pre-requisitos

### 1. En AWS EC2
- Ubuntu 20.04 LTS o superior
- Node.js v18 o superior instalado
- PM2 instalado globalmente
- Git instalado

### 2. Instalar Node.js en EC2 (si no está instalado)
```bash
# Instalar Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalación
node --version
npm --version
```

### 3. Instalar PM2 globalmente
```bash
sudo npm install -g pm2

# Verificar instalación
pm2 --version
```

## 🔧 Configuración Inicial

### 1. Clonar el repositorio
```bash
cd ~
git clone <tu-repositorio-url> whatsapp-bot
cd whatsapp-bot
```

### 2. Configurar variables de entorno
```bash
# Crear archivo .env
nano .env
```

Agrega las variables necesarias:
```env
NODE_ENV=production
FIREBASE_PROJECT_ID=tu-proyecto-id
FIREBASE_PRIVATE_KEY=tu-private-key
FIREBASE_CLIENT_EMAIL=tu-client-email
# ... otras variables
```

### 3. Asignar permisos al script de deploy
```bash
chmod +x deploy-aws.sh
```

## 🚀 Deploy del Bot

### Opción 1: Usando el script de deploy (Recomendado)
```bash
./deploy-aws.sh
```

Este script automáticamente:
- ✅ Verifica dependencias
- ✅ Limpia compilaciones anteriores
- ✅ Compila TypeScript a JavaScript
- ✅ Detiene procesos PM2 anteriores
- ✅ Inicia el bot con PM2
- ✅ Guarda la configuración de PM2

### Opción 2: Deploy manual
```bash
# 1. Instalar dependencias
npm install

# 2. Crear directorio de logs
mkdir -p logs

# 3. Compilar TypeScript
npm run build

# 4. Iniciar con PM2
npm run pm2:start
```

## 🔄 Actualizar el Bot

```bash
# 1. Ir al directorio del bot
cd ~/whatsapp-bot

# 2. Obtener últimos cambios
git pull

# 3. Ejecutar deploy
./deploy-aws.sh
```

O manualmente:
```bash
git pull
npm install
npm run pm2:restart
```

## 📊 Comandos de PM2 Útiles

### Ver estado del bot
```bash
pm2 status
# o
npm run pm2:status
```

### Ver logs en tiempo real
```bash
pm2 logs whatsapp-bot
# o
npm run pm2:logs
```

### Ver solo errores
```bash
npm run pm2:logs:error
```

### Reiniciar el bot
```bash
pm2 restart whatsapp-bot
# o
npm run pm2:restart
```

### Detener el bot
```bash
pm2 stop whatsapp-bot
# o
npm run pm2:stop
```

### Monitorear recursos
```bash
pm2 monit
# o
npm run pm2:monit
```

### Eliminar el bot de PM2
```bash
pm2 delete whatsapp-bot
# o
npm run pm2:delete
```

## 🔄 Configurar Auto-inicio

Para que el bot se inicie automáticamente cuando reinicies el servidor:

```bash
# 1. Generar script de inicio
pm2 startup

# 2. Copiar y ejecutar el comando que te muestra PM2
# Ejemplo: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

# 3. Guardar la configuración actual
pm2 save
```

Ahora el bot se iniciará automáticamente después de cada reinicio del servidor.

## 🐛 Solución de Problemas

### Error: "Unknown file extension .ts"
**Causa:** PM2 está intentando ejecutar archivos TypeScript directamente.

**Solución:**
```bash
# Asegúrate de compilar primero
npm run build

# Verifica que dist/index.js existe
ls -la dist/index.js

# Inicia PM2
pm2 start ecosystem.config.cjs
```

### El bot se reinicia constantemente
**Causa:** Error en el código o falta de dependencias.

**Solución:**
```bash
# Ver logs de error
pm2 logs whatsapp-bot --err

# Verificar que todas las dependencias estén instaladas
npm install

# Recompilar y reiniciar
npm run build
pm2 restart whatsapp-bot
```

### Error de memoria
**Causa:** El bot consume demasiada memoria.

**Solución:**
El `ecosystem.config.cjs` ya está configurado para reiniciar si usa más de 500MB:
```javascript
max_memory_restart: '500M'
```

Puedes ajustar este valor si es necesario.

### Ver archivos de log
```bash
# Logs de salida estándar
cat logs/pm2-out.log

# Logs de error
cat logs/pm2-error.log

# Logs combinados
cat logs/pm2-combined.log
```

## 📈 Monitoreo

### Ver uso de recursos en tiempo real
```bash
pm2 monit
```

### Ver información detallada
```bash
pm2 show whatsapp-bot
```

### Ver logs de los últimos 200 líneas
```bash
pm2 logs whatsapp-bot --lines 200
```

## 🔒 Seguridad

### 1. Proteger archivo .env
```bash
chmod 600 .env
```

### 2. Proteger credenciales de Firebase
```bash
chmod 600 firebase-credentials.json
```

### 3. Actualizar paquetes regularmente
```bash
npm audit
npm audit fix
```

## 🎯 Mejores Prácticas

1. **Siempre compila antes de iniciar PM2:**
   ```bash
   npm run build && pm2 start ecosystem.config.cjs
   ```

2. **Usa el script de deploy para actualizaciones:**
   ```bash
   ./deploy-aws.sh
   ```

3. **Monitorea los logs regularmente:**
   ```bash
   pm2 logs whatsapp-bot --lines 50
   ```

4. **Configura el auto-inicio:**
   ```bash
   pm2 startup
   pm2 save
   ```

5. **Mantén backups de la autenticación de Baileys:**
   ```bash
   cp -r baileys_auth baileys_auth.backup
   ```

## 📞 Comandos Rápidos

```bash
# Deploy completo
./deploy-aws.sh

# Ver estado
pm2 status

# Ver logs
pm2 logs whatsapp-bot

# Reiniciar
npm run pm2:restart

# Detener
npm run pm2:stop

# Eliminar
npm run pm2:delete
```

## ✅ Verificación Post-Deploy

Después del deploy, verifica:

1. ✅ El bot aparece como "online" en `pm2 status`
2. ✅ Los logs no muestran errores: `pm2 logs whatsapp-bot --err --lines 20`
3. ✅ El QR code se genera correctamente (primera vez)
4. ✅ El bot responde a comandos en WhatsApp

---

**Nota:** Este bot usa **SOLO Baileys** (@whiskeysockets/baileys) para la conexión con WhatsApp. No usa whatsapp-web.js ni otras librerías.
