# 🚀 Guía de Despliegue en AWS EC2 (Ubuntu)

Esta guía garantiza que tu entorno de producción en EC2 sea **exactamente igual** a tu entorno local, incluyendo la versión de Puppeteer y las dependencias del sistema.

## 1. Preparar el Servidor (Solo una vez)

### Instalar Node.js v22 (Igual que local)
```bash
# Descargar e instalar Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar versión (debe ser v22.x.x)
node -v
npm -v
```

### Instalar Librerías de Sistema para Puppeteer
Puppeteer descarga su propio Chrome, pero necesita estas librerías de Linux para funcionar:

```bash
sudo apt-get update
sudo apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils
```

### Instalar PM2 Globalmente
```bash
sudo npm install -g pm2
```

## 2. Desplegar el Código

### Clonar el Repositorio
```bash
cd /home/ubuntu
git clone https://github.com/PercyTuncar/bot-2026.git whatsapp-bot
cd whatsapp-bot
```

### Configurar Variables de Entorno
⚠️ **IMPORTANTE:** El archivo `.env` NO se sube a GitHub. Debes crearlo manualmente.

```bash
nano .env
```
Pega el contenido de tu `.env` local (copia desde VSCode). Asegúrate de incluir:
- `FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json`
- `WELCOME_IMAGES=true`
- `WELCOME_BG_URL=...`

### Configurar Credenciales de Firebase
Sube tu archivo `firebase-credentials.json` a la carpeta `whatsapp-bot/` usando SCP o nano.

## 3. Instalación "Exacta" de Dependencias

Para asegurar que se instalan **exactamente** las mismas versiones que en local, usa `npm ci` en lugar de `npm install`. Esto usa el `package-lock.json`.

```bash
# Borrar node_modules por si acaso
rm -rf node_modules

# Instalación limpia y exacta
npm ci
```

## 4. Compilación y Ejecución

```bash
# Compilar TypeScript a JavaScript
npm run build

# Iniciar con PM2 (usando la configuración de ecosistema)
pm2 start ecosystem.config.cjs

# Ver logs y escanear QR
pm2 logs whatsapp-bot
```

## 5. Actualizaciones Futuras

Cuando hagas cambios en local y los subas a GitHub, actualiza el servidor así:

```bash
cd /home/ubuntu/whatsapp-bot

# 1. Traer cambios
git pull origin main

# 2. Reinstalar dependencias (solo si cambiaron)
npm ci

# 3. Recompilar
npm run build

# 4. Reiniciar proceso
pm2 restart whatsapp-bot
```

## 🛠️ Solución de Problemas Comunes

### Error: "Browser was not found" o Puppeteer falla
Si Puppeteer falla al arrancar, fuerza la reinstalación del navegador:
```bash
npx puppeteer browsers install chrome
```

### Error de Permisos
Asegúrate de estar en la carpeta correcta y que el usuario tenga permisos.
```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/whatsapp-bot
```
