import sharp from 'sharp';
import { config } from '../config/environment.js';
import logger from '../lib/logger.js';
class WelcomeImageService {
    backgroundUrl;
    constructor() {
        this.backgroundUrl = '';
    }
    getMultiavatarUrl(seed) {
        const cleanSeed = encodeURIComponent(seed.replace(/@.*$/, '').replace(/[^a-zA-Z0-9]/g, ''));
        return `https://api.multiavatar.com/${cleanSeed}.svg`;
    }
    async createWelcomeImage(userId, userName, client) {
        try {
            if (!config.features.welcomeImages) {
                return null;
            }
            this.backgroundUrl = config.cloudinary.welcomeBgUrl;
            if (!this.backgroundUrl) {
                logger.warn('❌ No config: WELCOME_BG_URL');
                return null;
            }
            logger.info(`🖼️ Generating welcome image for: ${userName} (ID: ${userId})`);
            let avatarUrl = null;
            let usingMultiavatar = true;
            if (client) {
                try {
                    avatarUrl = await client.getProfilePicUrl(userId).catch(() => null);
                    if (!avatarUrl && userId.includes('@lid')) {
                        try {
                            const numberId = await client.getNumberId(userId.replace('@lid', '').replace('@c.us', ''));
                            if (numberId && numberId._serialized) {
                                logger.debug(`🖼️ Trying phone JID for profile pic: ${numberId._serialized}`);
                                avatarUrl = await client.getProfilePicUrl(numberId._serialized).catch(() => null);
                            }
                        }
                        catch (e) { }
                    }
                    if (!avatarUrl) {
                        const retryDelays = [500, 1000, 1500];
                        for (const delay of retryDelays) {
                            await new Promise(r => setTimeout(r, delay));
                            avatarUrl = await client.getProfilePicUrl(userId).catch(() => null);
                            if (avatarUrl) {
                                logger.info(`✅ Profile pic found on retry (after ${delay}ms wait)`);
                                break;
                            }
                        }
                    }
                    if (avatarUrl) {
                        usingMultiavatar = false;
                        logger.info(`✅ Profile pic found for ${userName || userId}`);
                    }
                }
                catch (e) {
                    logger.warn(`⚠️ Failed to fetch profile pic: ${e.message}`);
                }
            }
            if (!avatarUrl) {
                let seed = userName || userId;
                if (!seed || seed === 'undefined' || seed === 'null') {
                    seed = `user_${Math.floor(Math.random() * 100000)}`;
                }
                logger.info(`🎨 Using Multiavatar with seed: "${seed}"`);
                avatarUrl = this.getMultiavatarUrl(seed);
            }
            let avatarBuf;
            let bgBuf;
            try {
                const bgRes = await fetch(this.backgroundUrl);
                if (!bgRes.ok)
                    throw new Error(`Background HTTP ${bgRes.status}`);
                bgBuf = Buffer.from(await bgRes.arrayBuffer());
                try {
                    if (avatarUrl && !usingMultiavatar) {
                        const res = await fetch(avatarUrl);
                        if (res.ok) {
                            const contentType = res.headers.get('content-type');
                            if (contentType?.includes('image')) {
                                avatarBuf = Buffer.from(await res.arrayBuffer());
                            }
                            else {
                                throw new Error('Not an image');
                            }
                        }
                        else {
                            logger.warn(`⚠️ Avatar real falló (HTTP ${res.status}), cambiando a Multiavatar`);
                            usingMultiavatar = true;
                            avatarUrl = this.getMultiavatarUrl(userName || userId);
                        }
                    }
                    if (usingMultiavatar || !avatarBuf) {
                        logger.info(`🎨 Obteniendo Multiavatar para: ${userName || userId}`);
                        const res = await fetch(avatarUrl);
                        if (res.ok) {
                            const svgText = await res.text();
                            avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
                        }
                        else {
                            throw new Error(`Multiavatar failed: ${res.status}`);
                        }
                    }
                }
                catch (e) {
                    logger.error(`❌ Fallo crítico en avatar: ${e.message}. Usando placeholder.`);
                    avatarBuf = await this.createPlaceholderAvatar();
                }
            }
            catch (err) {
                logger.error('❌ Error fatal descargando recursos (posiblemente fondo):', err.message);
                return null;
            }
            const bgWidth = 800;
            const bgHeight = 800;
            const bgBufResized = await sharp(bgBuf)
                .resize(bgWidth, bgHeight, { fit: 'cover' })
                .png()
                .toBuffer();
            const AV_SIZE = 200;
            const RING_STROKE = 10;
            const RING_PADDING = 5;
            const RING_OUTER = AV_SIZE + (RING_PADDING * 2) + (RING_STROKE * 2);
            const SVG_SIZE = RING_OUTER + 4;
            const BRAND_YELLOW = '#FFC837';
            const BRAND_ORANGE = '#FF3D00';
            const NAME_WHITE = '#FFFFFF';
            const DATE_GRAY = '#E0E0E0';
            const now = new Date();
            const dateTimeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const avatarTargetSize = AV_SIZE + 2;
            const avatarResized = await sharp(avatarBuf)
                .resize(avatarTargetSize + 40, avatarTargetSize + 40, {
                fit: 'cover',
                position: 'centre'
            })
                .png()
                .toBuffer();
            const circleMask = Buffer.from(`<svg width="${avatarTargetSize}" height="${avatarTargetSize}" xmlns="http://www.w3.org/2000/svg">
           <circle cx="${avatarTargetSize / 2}" cy="${avatarTargetSize / 2}" r="${avatarTargetSize / 2}" fill="white"/>
         </svg>`);
            const avatarRounded = await sharp(avatarResized)
                .resize(avatarTargetSize, avatarTargetSize, { fit: 'cover', position: 'centre' })
                .composite([{ input: circleMask, blend: 'dest-in' }])
                .png()
                .toBuffer();
            const ringSvg = Buffer.from(`<svg width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ringGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND_ORANGE}"/>
      <stop offset="100%" stop-color="${BRAND_YELLOW}"/>
    </linearGradient>
  </defs>
  <circle cx="${SVG_SIZE / 2}" cy="${SVG_SIZE / 2}" r="${(RING_OUTER / 2) - (RING_STROKE / 2)}" fill="none" stroke="url(#ringGrad)" stroke-width="${RING_STROKE}"/>
</svg>`);
            const ringRendered = await sharp(ringSvg).png().toBuffer();
            const welcomeTextSize = 46;
            const userNameSize = 32;
            const dateTimeSize = 16;
            const spacingAfterAvatar = 10;
            const spacingAfterWelcome = 8;
            const spacingAfterName = 6;
            const totalBlockHeight = SVG_SIZE + spacingAfterAvatar + welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize;
            const startY = Math.floor((bgHeight - totalBlockHeight) / 2);
            const centerX = bgWidth / 2;
            const ringX = Math.floor(centerX - (SVG_SIZE / 2));
            const ringY = startY;
            const avatarX = Math.floor(ringX + (SVG_SIZE / 2) - (avatarTargetSize / 2));
            const avatarY = Math.floor(ringY + (SVG_SIZE / 2) - (avatarTargetSize / 2));
            const safeUserName = userName ? this.escapeXml(userName) : 'Usuario';
            const svgTextHeight = welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize + 30;
            const welcomeSvg = Buffer.from(`<svg width="${bgWidth}" height="${svgTextHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_YELLOW}"/>
      <stop offset="50%" stop-color="#FF8008"/>
      <stop offset="100%" stop-color="${BRAND_ORANGE}"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${BRAND_ORANGE}" flood-opacity="0.5"/>
    </filter>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)"/>
    </filter>
  </defs>
  <text x="50%" y="${welcomeTextSize}" font-family="Arial Black, Arial, sans-serif" font-size="${welcomeTextSize}" font-weight="900" letter-spacing="3" fill="url(#textGrad)" text-anchor="middle" filter="url(#glow)">WELCOME</text>
  <text x="50%" y="${welcomeTextSize + spacingAfterWelcome + userNameSize}" font-family="Arial, Helvetica, sans-serif" font-size="${userNameSize}" font-weight="bold" fill="${NAME_WHITE}" text-anchor="middle" filter="url(#textShadow)">${safeUserName}</text>
  <text x="50%" y="${welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize}" font-family="Arial, Helvetica, sans-serif" font-size="${dateTimeSize}" fill="${DATE_GRAY}" text-anchor="middle">${dateTimeStr}</text>
</svg>`);
            const welcomeRendered = await sharp(welcomeSvg).png().toBuffer();
            const textY = ringY + SVG_SIZE + spacingAfterAvatar;
            const finalBuffer = await sharp(bgBufResized)
                .ensureAlpha()
                .composite([
                { input: ringRendered, left: ringX, top: ringY },
                { input: avatarRounded, left: avatarX, top: avatarY },
                { input: welcomeRendered, left: 0, top: textY },
            ])
                .png({ quality: 90, compressionLevel: 6 })
                .toBuffer();
            logger.info(`✅ Imagen de bienvenida generada: ${finalBuffer.length} bytes`);
            return finalBuffer;
        }
        catch (error) {
            logger.error('❌ Error creando imagen de bienvenida:', error.message);
            return null;
        }
    }
    async createWelcomeImageWithPhoto(userId, userName, profilePicUrl, client) {
        try {
            logger.info(`\n╔════════════════════════════════════════════════════════════════╗`);
            logger.info(`║       DEBUG - WelcomeImageService.createWelcomeImageWithPhoto   ║`);
            logger.info(`╠════════════════════════════════════════════════════════════════╣`);
            logger.info(`║ PARÁMETROS RECIBIDOS:`);
            logger.info(`║   • userId:        ${userId}`);
            logger.info(`║   • userName:      ${userName || 'NULL'}`);
            logger.info(`║   • profilePicUrl: ${profilePicUrl ? 'SÍ (URL presente)' : 'NULL'}`);
            if (profilePicUrl) {
                logger.info(`║   • URL completa:  ${profilePicUrl.substring(0, 60)}...`);
            }
            logger.info(`╚════════════════════════════════════════════════════════════════╝`);
            if (!config.features.welcomeImages) {
                logger.info(`❌ welcomeImages deshabilitado en config`);
                return null;
            }
            this.backgroundUrl = config.cloudinary.welcomeBgUrl;
            if (!this.backgroundUrl) {
                logger.warn('❌ No config: WELCOME_BG_URL');
                return null;
            }
            logger.info(`🖼️ Creating welcome image for: ${userName || userId} (preloaded pic: ${!!profilePicUrl})`);
            let avatarUrl;
            let usingMultiavatar = false;
            if (profilePicUrl) {
                avatarUrl = profilePicUrl;
                logger.info(`✅ Usando foto de perfil pre-cargada: ${avatarUrl.substring(0, 50)}...`);
            }
            else {
                let seed = userName || userId;
                if (!seed || seed === 'undefined' || seed === 'null' || /^\d{10,}$/.test(seed)) {
                    seed = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                    logger.info(`⚠️ Seed inválido (era: "${userName || userId}"), usando: "${seed}"`);
                }
                avatarUrl = this.getMultiavatarUrl(seed);
                usingMultiavatar = true;
                logger.info(`🎨 Usando Multiavatar con seed: "${seed}"`);
                logger.info(`🎨 URL Multiavatar: ${avatarUrl}`);
            }
            let displayNameForImage = userName;
            if (!displayNameForImage || displayNameForImage === 'undefined' || displayNameForImage === 'null' || /^\d{10,}$/.test(displayNameForImage)) {
                displayNameForImage = 'Usuario';
                logger.info(`⚠️ userName no válido ("${userName}"), usando "Usuario" en la imagen`);
            }
            logger.info(`📝 Nombre que se mostrará en imagen: "${displayNameForImage}"`);
            let avatarBuf;
            let bgBuf;
            try {
                const fetchWithTimeout = async (url, timeoutMs = 15000) => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                    try {
                        const res = await fetch(url, { signal: controller.signal });
                        clearTimeout(timeoutId);
                        return res;
                    }
                    catch (e) {
                        clearTimeout(timeoutId);
                        throw e;
                    }
                };
                const [avatarRes, bgRes] = await Promise.all([
                    fetchWithTimeout(avatarUrl, 10000),
                    fetchWithTimeout(this.backgroundUrl, 10000),
                ]);
                if (!avatarRes.ok) {
                    logger.warn(`Avatar HTTP ${avatarRes.status}, usando Multiavatar`);
                    const fallbackUrl = this.getMultiavatarUrl(`fallback_${Date.now()}`);
                    const fallbackRes = await fetchWithTimeout(fallbackUrl, 10000);
                    if (fallbackRes.ok) {
                        const svgText = await fallbackRes.text();
                        avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
                    }
                    else {
                        avatarBuf = await this.createPlaceholderAvatar();
                    }
                }
                else if (usingMultiavatar) {
                    const svgText = await avatarRes.text();
                    avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
                }
                else {
                    avatarBuf = Buffer.from(await avatarRes.arrayBuffer());
                }
                if (!bgRes.ok) {
                    throw new Error(`Background HTTP ${bgRes.status}`);
                }
                bgBuf = Buffer.from(await bgRes.arrayBuffer());
            }
            catch (err) {
                logger.error('❌ Error descargando recursos:', err.message || err);
                return null;
            }
            const bgWidth = 800;
            const bgHeight = 800;
            const AV_SIZE = 200;
            const RING_STROKE = 10;
            const RING_PADDING = 5;
            const RING_OUTER = AV_SIZE + (RING_PADDING * 2) + (RING_STROKE * 2);
            const SVG_SIZE = RING_OUTER + 4;
            const BRAND_YELLOW = '#FFC837';
            const BRAND_ORANGE = '#FF3D00';
            const NAME_WHITE = '#FFFFFF';
            const DATE_GRAY = '#E0E0E0';
            const now = new Date();
            const dateTimeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const bgBufResized = await sharp(bgBuf)
                .resize(bgWidth, bgHeight, { fit: 'cover' })
                .png()
                .toBuffer();
            const avatarTargetSize = AV_SIZE + 2;
            const avatarResized = await sharp(avatarBuf)
                .resize(avatarTargetSize + 40, avatarTargetSize + 40, { fit: 'cover', position: 'centre' })
                .png()
                .toBuffer();
            const circleMask = Buffer.from(`<svg width="${avatarTargetSize}" height="${avatarTargetSize}" xmlns="http://www.w3.org/2000/svg">
           <circle cx="${avatarTargetSize / 2}" cy="${avatarTargetSize / 2}" r="${avatarTargetSize / 2}" fill="white"/>
         </svg>`);
            const avatarRounded = await sharp(avatarResized)
                .resize(avatarTargetSize, avatarTargetSize, { fit: 'cover', position: 'centre' })
                .composite([{ input: circleMask, blend: 'dest-in' }])
                .png()
                .toBuffer();
            const ringSvg = Buffer.from(`<svg width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ringGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND_ORANGE}"/>
      <stop offset="100%" stop-color="${BRAND_YELLOW}"/>
    </linearGradient>
  </defs>
  <circle cx="${SVG_SIZE / 2}" cy="${SVG_SIZE / 2}" r="${(RING_OUTER / 2) - (RING_STROKE / 2)}" fill="none" stroke="url(#ringGrad)" stroke-width="${RING_STROKE}"/>
</svg>`);
            const ringRendered = await sharp(ringSvg).png().toBuffer();
            const welcomeTextSize = 46;
            const userNameSize = 32;
            const dateTimeSize = 16;
            const spacingAfterAvatar = 10;
            const spacingAfterWelcome = 8;
            const spacingAfterName = 6;
            const totalBlockHeight = SVG_SIZE + spacingAfterAvatar + welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize;
            const startY = Math.floor((bgHeight - totalBlockHeight) / 2);
            const centerX = bgWidth / 2;
            const ringX = Math.floor(centerX - (SVG_SIZE / 2));
            const ringY = startY;
            const avatarX = Math.floor(ringX + (SVG_SIZE / 2) - (avatarTargetSize / 2));
            const avatarY = Math.floor(ringY + (SVG_SIZE / 2) - (avatarTargetSize / 2));
            const safeUserName = userName ? this.escapeXml(userName) : 'Usuario';
            const svgTextHeight = welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize + 30;
            const welcomeSvg = Buffer.from(`<svg width="${bgWidth}" height="${svgTextHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_YELLOW}"/>
      <stop offset="50%" stop-color="#FF8008"/>
      <stop offset="100%" stop-color="${BRAND_ORANGE}"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${BRAND_ORANGE}" flood-opacity="0.5"/>
    </filter>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)"/>
    </filter>
  </defs>
  <text x="50%" y="${welcomeTextSize}" font-family="Arial Black, Arial, sans-serif" font-size="${welcomeTextSize}" font-weight="900" letter-spacing="3" fill="url(#textGrad)" text-anchor="middle" filter="url(#glow)">WELCOME</text>
  <text x="50%" y="${welcomeTextSize + spacingAfterWelcome + userNameSize}" font-family="Arial, Helvetica, sans-serif" font-size="${userNameSize}" font-weight="bold" fill="${NAME_WHITE}" text-anchor="middle" filter="url(#textShadow)">${safeUserName}</text>
  <text x="50%" y="${welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize}" font-family="Arial, Helvetica, sans-serif" font-size="${dateTimeSize}" fill="${DATE_GRAY}" text-anchor="middle">${dateTimeStr}</text>
</svg>`);
            const welcomeRendered = await sharp(welcomeSvg).png().toBuffer();
            const textY = ringY + SVG_SIZE + spacingAfterAvatar;
            const finalBuffer = await sharp(bgBufResized)
                .ensureAlpha()
                .composite([
                { input: ringRendered, left: ringX, top: ringY },
                { input: avatarRounded, left: avatarX, top: avatarY },
                { input: welcomeRendered, left: 0, top: textY },
            ])
                .png({ quality: 90, compressionLevel: 6 })
                .toBuffer();
            logger.info(`✅ Imagen de bienvenida generada (with photo): ${finalBuffer.length} bytes`);
            return finalBuffer;
        }
        catch (error) {
            logger.error('❌ Error creando imagen de bienvenida:', error.message);
            return null;
        }
    }
    async createPlaceholderAvatar() {
        const size = 300;
        const svg = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFC837"/>
      <stop offset="100%" stop-color="#FF3D00"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bgGrad)"/>
  <circle cx="${size / 2}" cy="${size / 3}" r="${size / 5}" fill="rgba(255,255,255,0.9)"/>
  <ellipse cx="${size / 2}" cy="${size * 0.95}" rx="${size / 2.8}" ry="${size / 3}" fill="rgba(255,255,255,0.9)"/>
</svg>`);
        logger.warn('⚠️ Usando placeholder de último recurso (Multiavatar no disponible)');
        return await sharp(svg).png().toBuffer();
    }
    escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    static async generateWelcomeImage(avatarUrl, userName, groupName) {
        return welcomeImageService.createWelcomeImageLegacy(avatarUrl, userName);
    }
    async createWelcomeImageLegacy(avatarUrl, userName) {
        try {
            if (!config.features.welcomeImages) {
                logger.debug('Welcome images disabled in config');
                return null;
            }
            this.backgroundUrl = config.cloudinary.welcomeBgUrl;
            if (!this.backgroundUrl) {
                logger.warn('❌ No hay URL de fondo configurada (WELCOME_BG_URL)');
                return null;
            }
            logger.info(`🖼️ Generando imagen de bienvenida para ${userName || 'Usuario'}`);
            logger.info(`🖼️ URL de fondo: ${this.backgroundUrl}`);
            let avatarBuf;
            let bgBuf;
            const avatarSeed = userName || `user_${Date.now()}`;
            let usingMultiavatar = false;
            try {
                let avatarFetchUrl;
                if (avatarUrl && avatarUrl.trim() !== '') {
                    avatarFetchUrl = avatarUrl;
                }
                else {
                    avatarFetchUrl = this.getMultiavatarUrl(avatarSeed);
                    usingMultiavatar = true;
                    logger.info(`🎨 Sin foto de perfil, usando Multiavatar para ${userName}`);
                }
                const [avatarRes, bgRes] = await Promise.all([
                    fetch(avatarFetchUrl),
                    fetch(this.backgroundUrl),
                ]);
                if (!avatarRes.ok) {
                    logger.warn(`Avatar HTTP ${avatarRes.status}, usando Multiavatar alternativo`);
                    const fallbackUrl = this.getMultiavatarUrl(`fallback_${Date.now()}`);
                    const fallbackRes = await fetch(fallbackUrl);
                    if (fallbackRes.ok) {
                        const svgText = await fallbackRes.text();
                        avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
                    }
                    else {
                        avatarBuf = await this.createPlaceholderAvatar();
                    }
                }
                else if (usingMultiavatar) {
                    const svgText = await avatarRes.text();
                    avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
                }
                else {
                    avatarBuf = Buffer.from(await avatarRes.arrayBuffer());
                }
                if (!bgRes.ok) {
                    throw new Error(`Background HTTP ${bgRes.status}`);
                }
                bgBuf = Buffer.from(await bgRes.arrayBuffer());
            }
            catch (err) {
                logger.error('❌ Error descargando recursos:', err.message);
                return null;
            }
            const bgWidth = 800;
            const bgHeight = 800;
            const AV_SIZE = 200;
            const RING_STROKE = 10;
            const RING_PADDING = 5;
            const RING_OUTER = AV_SIZE + (RING_PADDING * 2) + (RING_STROKE * 2);
            const SVG_SIZE = RING_OUTER + 4;
            const BRAND_YELLOW = '#FFC837';
            const BRAND_ORANGE = 'rgba(255, 120, 9, 1)';
            const NAME_WHITE = '#FFFFFF';
            const DATE_GRAY = '#E0E0E0';
            const now = new Date();
            const dateTimeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const bgBufResized = await sharp(bgBuf)
                .resize(bgWidth, bgHeight, { fit: 'cover' })
                .png()
                .toBuffer();
            const avatarTargetSize = AV_SIZE + 2;
            const avatarResized = await sharp(avatarBuf)
                .resize(avatarTargetSize + 40, avatarTargetSize + 40, {
                fit: 'cover',
                position: 'centre'
            })
                .png()
                .toBuffer();
            const circleMask = Buffer.from(`<svg width="${avatarTargetSize}" height="${avatarTargetSize}" xmlns="http://www.w3.org/2000/svg">
           <circle cx="${avatarTargetSize / 2}" cy="${avatarTargetSize / 2}" r="${avatarTargetSize / 2}" fill="white"/>
         </svg>`);
            const avatarRounded = await sharp(avatarResized)
                .resize(avatarTargetSize, avatarTargetSize, { fit: 'cover', position: 'centre' })
                .composite([{ input: circleMask, blend: 'dest-in' }])
                .png()
                .toBuffer();
            const ringSvg = Buffer.from(`<svg width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ringGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND_ORANGE}"/>
      <stop offset="100%" stop-color="${BRAND_YELLOW}"/>
    </linearGradient>
  </defs>
  <circle cx="${SVG_SIZE / 2}" cy="${SVG_SIZE / 2}" r="${(RING_OUTER / 2) - (RING_STROKE / 2)}" fill="none" stroke="url(#ringGrad)" stroke-width="${RING_STROKE}"/>
</svg>`);
            const ringRendered = await sharp(ringSvg).png().toBuffer();
            const welcomeTextSize = 46;
            const userNameSize = 32;
            const dateTimeSize = 16;
            const spacingAfterAvatar = 10;
            const spacingAfterWelcome = 8;
            const spacingAfterName = 6;
            const totalBlockHeight = SVG_SIZE + spacingAfterAvatar + welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize;
            const startY = Math.floor((bgHeight - totalBlockHeight) / 2);
            const centerX = bgWidth / 2;
            const ringX = Math.floor(centerX - (SVG_SIZE / 2));
            const ringY = startY;
            const avatarX = Math.floor(ringX + (SVG_SIZE / 2) - (avatarTargetSize / 2));
            const avatarY = Math.floor(ringY + (SVG_SIZE / 2) - (avatarTargetSize / 2));
            const safeUserName = userName ? this.escapeXml(userName) : 'Usuario';
            const svgTextHeight = welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize + 30;
            const welcomeSvg = Buffer.from(`<svg width="${bgWidth}" height="${svgTextHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${BRAND_YELLOW}"/>
      <stop offset="50%" stop-color="#FF8008"/>
      <stop offset="100%" stop-color="${BRAND_ORANGE}"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${BRAND_ORANGE}" flood-opacity="0.5"/>
    </filter>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)"/>
    </filter>
  </defs>
  <text x="50%" y="${welcomeTextSize}" font-family="Arial Black, Arial, sans-serif" font-size="${welcomeTextSize}" font-weight="900" letter-spacing="3" fill="url(#textGrad)" text-anchor="middle" filter="url(#glow)">WELCOME</text>
  <text x="50%" y="${welcomeTextSize + spacingAfterWelcome + userNameSize}" font-family="Arial, Helvetica, sans-serif" font-size="${userNameSize}" font-weight="bold" fill="${NAME_WHITE}" text-anchor="middle" filter="url(#textShadow)">${safeUserName}</text>
  <text x="50%" y="${welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize}" font-family="Arial, Helvetica, sans-serif" font-size="${dateTimeSize}" fill="${DATE_GRAY}" text-anchor="middle">${dateTimeStr}</text>
</svg>`);
            const welcomeRendered = await sharp(welcomeSvg).png().toBuffer();
            const textY = ringY + SVG_SIZE + spacingAfterAvatar;
            const finalBuffer = await sharp(bgBufResized)
                .ensureAlpha()
                .composite([
                { input: ringRendered, left: ringX, top: ringY },
                { input: avatarRounded, left: avatarX, top: avatarY },
                { input: welcomeRendered, left: 0, top: textY },
            ])
                .png({ quality: 90, compressionLevel: 6 })
                .toBuffer();
            logger.info(`✅ Imagen de bienvenida generada: ${finalBuffer.length} bytes`);
            return finalBuffer;
        }
        catch (error) {
            logger.error('❌ Error creando imagen de bienvenida:', error.message);
            return null;
        }
    }
}
const welcomeImageService = new WelcomeImageService();
export { welcomeImageService, WelcomeImageService };
export default WelcomeImageService;
