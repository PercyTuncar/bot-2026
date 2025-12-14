import sharp from 'sharp';
import { config } from '../config/environment.js';
import logger from '../lib/logger.js';

/**
 * WelcomeImageService - Servicio de generación de imágenes de bienvenida personalizadas
 * 
 * Patrón: Singleton
 * Dependencia principal: Sharp (procesamiento de imágenes de alto rendimiento)
 * 
 * Características:
 * - Procesamiento 100% en servidor (no requiere canvas del navegador)
 * - Avatar circular con máscara SVG perfecta
 * - Aro naranja degradado sin clipping
 * - Tipografía del sistema (Arial/Helvetica) compatible con librsvg
 * - Centrado absoluto de todos los elementos
 * 
 * NOTA: No se usan fuentes externas embebidas porque librsvg (usado por Sharp)
 * no soporta @font-face con data URLs largas - corrompe el parsing XML.
 */
class WelcomeImageService {
  private backgroundUrl: string;

  constructor() {
    this.backgroundUrl = '';
  }

  /**
   * Genera una URL de Multiavatar única basada en una semilla
   * @param seed - Identificador único (userId, nombre, etc.)
   * @returns URL del avatar SVG de Multiavatar
   */
  private getMultiavatarUrl(seed: string): string {
    // Limpiar la semilla para que sea URL-safe
    const cleanSeed = encodeURIComponent(seed.replace(/@.*$/, '').replace(/[^a-zA-Z0-9]/g, ''));
    return `https://api.multiavatar.com/${cleanSeed}.svg`;
  }

  /**
   * Genera una imagen de bienvenida personalizada
   */
  async createWelcomeImage(
    userId: string,
    userName: string | null,
    client: any
  ): Promise<Buffer | null> {
    try {
      // Verificar habilitación
      if (!config.features.welcomeImages) {
        return null;
      }

      this.backgroundUrl = config.cloudinary.welcomeBgUrl;
      if (!this.backgroundUrl) {
        logger.warn('❌ No config: WELCOME_BG_URL');
        return null;
      }

      logger.info(`🖼️ Generating welcome image for: ${userName} (ID: ${userId})`);

      // ============================================================
      // PASO 1: Obtener la MEJOR URL de Avatar posible
      // ============================================================
      let avatarUrl: string | null = null;
      let usingMultiavatar = true;

      if (client) {
        try {
          // Estrategia de reintentos escalonada para la foto de perfil
          // 1. Intentar ID original
          avatarUrl = await client.getProfilePicUrl(userId).catch(() => null);

          // 2. Si falló y es LID, intentar con ID de teléfono
          if (!avatarUrl && userId.includes('@lid')) {
            try {
              const numberId = await client.getNumberId(userId.replace('@lid', '').replace('@c.us', ''));
              if (numberId && numberId._serialized) {
                logger.debug(`🖼️ Trying phone JID for profile pic: ${numberId._serialized}`);
                avatarUrl = await client.getProfilePicUrl(numberId._serialized).catch(() => null);
              }
            } catch (e) { }
          }

          // 3. Fallback final: Esperar un poco y reintentar (útil para sync lag)
          if (!avatarUrl) {
            await new Promise(r => setTimeout(r, 500));
            avatarUrl = await client.getProfilePicUrl(userId).catch(() => null);
          }

          if (avatarUrl) {
            usingMultiavatar = false;
            logger.info(`✅ Profile pic found for ${userName || userId}`);
          }
        } catch (e: any) {
          logger.warn(`⚠️ Failed to fetch profile pic: ${e.message}`);
        }
      }

      // Si no hay foto, usar Multiavatar con semilla dinámica
      if (!avatarUrl) {
        // Usar userName si existe, sino userId
        // CRITICO: Para "variar", aseguramos que la semilla no sea "undefined" o vacía
        let seed = userName || userId;
        if (!seed || seed === 'undefined' || seed === 'null') {
          seed = `user_${Math.floor(Math.random() * 100000)}`;
        }

        // Si el usuario quiere variedad "random", podemos agregar un componente aleatorio
        // aunque lo ideal es que sea consistente para el mismo usuario.
        // Mantendremos consistencia por usuario.
        logger.info(`🎨 Using Multiavatar with seed: "${seed}"`);
        avatarUrl = this.getMultiavatarUrl(seed);
      }

      // ============================================================
      // PASO 2: Descargar Recursos (en paralelo)
      // ============================================================
      let avatarBuf: Buffer;
      let bgBuf: Buffer;

      try {
        const [avatarRes, bgRes] = await Promise.all([
          fetch(avatarUrl),
          fetch(this.backgroundUrl),
        ]);

        if (!avatarRes.ok) {
          logger.warn(`Avatar HTTP ${avatarRes.status}, generando Multiavatar alternativo`);
          // Intentar con un seed aleatorio si falla
          const fallbackUrl = this.getMultiavatarUrl(`fallback_${Date.now()}`);
          const fallbackRes = await fetch(fallbackUrl);
          if (fallbackRes.ok) {
            const svgText = await fallbackRes.text();
            // Convertir SVG a PNG con Sharp
            avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
          } else {
            avatarBuf = await this.createPlaceholderAvatar();
          }
        } else {
          // Si es Multiavatar (SVG), convertir a PNG
          if (usingMultiavatar) {
            const svgText = await avatarRes.text();
            avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
            logger.debug(`🎨 Multiavatar SVG convertido a PNG para ${userName}`);
          } else {
            avatarBuf = Buffer.from(await avatarRes.arrayBuffer());
          }
        }

        if (!bgRes.ok) {
          throw new Error(`Background HTTP ${bgRes.status}`);
        }

        bgBuf = Buffer.from(await bgRes.arrayBuffer());

      } catch (err: any) {
        logger.error('❌ Error descargando recursos:', err.message);
        return null;
      }

      // ============================================================
      // PASO 3: Procesar Imagen de Fondo
      // ============================================================
      const bgWidth = 800;
      const bgHeight = 800;

      const bgBufResized = await sharp(bgBuf)
        .resize(bgWidth, bgHeight, { fit: 'cover' })
        .png()
        .toBuffer();

      // ============================================================
      // CONFIGURACIÓN DE DISEÑO AJUSTADA (Pixel Perfect)
      // ============================================================
      const AV_SIZE = 200;           // Tamaño del avatar (círculo interno)
      const RING_STROKE = 10;        // Grosor del aro naranja (aumentado para cubrir mejor)
      const RING_PADDING = 5;        // Espacio entre avatar y aro
      const RING_OUTER = AV_SIZE + (RING_PADDING * 2) + (RING_STROKE * 2);
      const SVG_SIZE = RING_OUTER + 4; // Lienzo un poco más grande para antialiasing

      // Colores de Marca Ajustados (Paleta Cítrica RaveHub)
      const BRAND_YELLOW = '#FFC837'; // Amarillo Ámbar (Luz) - Similar al logo
      const BRAND_ORANGE = '#FF3D00'; // Naranja Neón (Vibrante)
      const NAME_WHITE = '#FFFFFF';
      const DATE_GRAY = '#E0E0E0';    // Gris más claro para mejor lectura

      // Fecha y hora actual
      const now = new Date();
      const dateTimeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // ============================================================
      // PASO 4: AVATAR CON OVERLAP (evita línea blanca)
      // ============================================================
      // Truco: Avatar 2px más grande que el hueco para que se meta debajo del borde
      const avatarTargetSize = AV_SIZE + 2;

      // Redimensionar primero a un tamaño mayor
      const avatarResized = await sharp(avatarBuf)
        .resize(avatarTargetSize + 40, avatarTargetSize + 40, {
          fit: 'cover',
          position: 'centre'
        })
        .png()
        .toBuffer();

      // Crear máscara circular para el avatar con overlap
      const circleMask = Buffer.from(
        `<svg width="${avatarTargetSize}" height="${avatarTargetSize}" xmlns="http://www.w3.org/2000/svg">
           <circle cx="${avatarTargetSize / 2}" cy="${avatarTargetSize / 2}" r="${avatarTargetSize / 2}" fill="white"/>
         </svg>`
      );

      // Aplicar máscara circular
      const avatarRounded = await sharp(avatarResized)
        .resize(avatarTargetSize, avatarTargetSize, { fit: 'cover', position: 'centre' })
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      // ============================================================
      // PASO 5: ARO NARANJA CENTRADO MATEMÁTICAMENTE
      // ============================================================
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

      // ============================================================
      // CALCULAR POSICIONES (Centrado Matemático Perfecto)
      // ============================================================
      const welcomeTextSize = 46;    // Más grande e impactante
      const userNameSize = 32;
      const dateTimeSize = 16;

      // Espaciados reducidos para diseño más compacto
      const spacingAfterAvatar = 10; // Reducido de 20 a 10
      const spacingAfterWelcome = 8;
      const spacingAfterName = 6;

      // Altura total del bloque
      const totalBlockHeight = SVG_SIZE + spacingAfterAvatar + welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize;

      // Posición Y inicial para centrar verticalmente
      const startY = Math.floor((bgHeight - totalBlockHeight) / 2);

      // Centro horizontal del lienzo
      const centerX = bgWidth / 2;

      // Posición del aro (centrado horizontalmente)
      const ringX = Math.floor(centerX - (SVG_SIZE / 2));
      const ringY = startY;

      // Avatar centrado EXACTAMENTE dentro del Ring
      // Fórmula: PosiciónAro + MitadAro - MitadAvatar
      const avatarX = Math.floor(ringX + (SVG_SIZE / 2) - (avatarTargetSize / 2));
      const avatarY = Math.floor(ringY + (SVG_SIZE / 2) - (avatarTargetSize / 2));

      // ============================================================
      // PASO 6: TEXTO SVG CON DEGRADADO PREMIUM
      // ============================================================
      const safeUserName = userName ? this.escapeXml(userName) : 'Usuario';
      const svgTextHeight = welcomeTextSize + spacingAfterWelcome + userNameSize + spacingAfterName + dateTimeSize + 30;

      // SVG con degradado cítrico en "WELCOME" y glow naranja neón
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

      // Posición Y del texto (debajo del avatar con espaciado reducido)
      const textY = ringY + SVG_SIZE + spacingAfterAvatar;

      // ============================================================
      // PASO 7: COMPOSICIÓN FINAL
      // ============================================================
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

    } catch (error: any) {
      logger.error('❌ Error creando imagen de bienvenida:', error.message);
      return null;
    }
  }

  /**
   * Crea un avatar placeholder como último recurso (si Multiavatar también falla)
   * Genera un avatar con gradiente naranja acorde a la marca RaveHub
   */
  private async createPlaceholderAvatar(): Promise<Buffer> {
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

  /**
   * Escapa caracteres especiales XML para SVG
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Método estático de compatibilidad
   */
  static async generateWelcomeImage(
    avatarUrl: string | null,
    userName: string | null,
    groupName: string
  ): Promise<Buffer | null> {
    return welcomeImageService.createWelcomeImageLegacy(avatarUrl, userName);
  }

  /**
   * Método legacy para compatibilidad con código existente
   */
  async createWelcomeImageLegacy(
    avatarUrl: string | null,
    userName: string | null
  ): Promise<Buffer | null> {
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

      // Descargar recursos
      let avatarBuf: Buffer;
      let bgBuf: Buffer;
      const avatarSeed = userName || `user_${Date.now()}`;
      let usingMultiavatar = false;

      try {
        let avatarFetchUrl: string;
        if (avatarUrl && avatarUrl.trim() !== '') {
          avatarFetchUrl = avatarUrl;
        } else {
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
          } else {
            avatarBuf = await this.createPlaceholderAvatar();
          }
        } else if (usingMultiavatar) {
          const svgText = await avatarRes.text();
          avatarBuf = await sharp(Buffer.from(svgText)).png().toBuffer();
        } else {
          avatarBuf = Buffer.from(await avatarRes.arrayBuffer());
        }

        if (!bgRes.ok) {
          throw new Error(`Background HTTP ${bgRes.status}`);
        }

        bgBuf = Buffer.from(await bgRes.arrayBuffer());

      } catch (err: any) {
        logger.error('❌ Error descargando recursos:', err.message);
        return null;
      }

      // ============================================================
      // CONFIGURACIÓN DE DISEÑO AJUSTADA (Pixel Perfect)
      // ============================================================
      const bgWidth = 800;
      const bgHeight = 800;
      const AV_SIZE = 200;
      const RING_STROKE = 10;        // Grosor aumentado
      const RING_PADDING = 5;
      const RING_OUTER = AV_SIZE + (RING_PADDING * 2) + (RING_STROKE * 2);
      const SVG_SIZE = RING_OUTER + 4;

      // Colores de Marca (Paleta Cítrica RaveHub)
      const BRAND_YELLOW = '#FFC837';
      const BRAND_ORANGE = 'rgba(255, 120, 9, 1)';
      const NAME_WHITE = '#FFFFFF';
      const DATE_GRAY = '#E0E0E0';

      const now = new Date();
      const dateTimeStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Procesar fondo
      const bgBufResized = await sharp(bgBuf)
        .resize(bgWidth, bgHeight, { fit: 'cover' })
        .png()
        .toBuffer();

      // ============================================================
      // CREAR AVATAR CON OVERLAP
      // ============================================================
      const avatarTargetSize = AV_SIZE + 2;

      const avatarResized = await sharp(avatarBuf)
        .resize(avatarTargetSize + 40, avatarTargetSize + 40, {
          fit: 'cover',
          position: 'centre'
        })
        .png()
        .toBuffer();

      const circleMask = Buffer.from(
        `<svg width="${avatarTargetSize}" height="${avatarTargetSize}" xmlns="http://www.w3.org/2000/svg">
           <circle cx="${avatarTargetSize / 2}" cy="${avatarTargetSize / 2}" r="${avatarTargetSize / 2}" fill="white"/>
         </svg>`
      );

      const avatarRounded = await sharp(avatarResized)
        .resize(avatarTargetSize, avatarTargetSize, { fit: 'cover', position: 'centre' })
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      // ============================================================
      // CREAR ARO NARANJA (Degradado Cítrico Diagonal)
      // ============================================================
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

      // ============================================================
      // CALCULAR POSICIONES (Centrado Matemático)
      // ============================================================
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

      // Avatar centrado EXACTAMENTE dentro del Ring
      const avatarX = Math.floor(ringX + (SVG_SIZE / 2) - (avatarTargetSize / 2));
      const avatarY = Math.floor(ringY + (SVG_SIZE / 2) - (avatarTargetSize / 2));

      // ============================================================
      // GENERAR TEXTO SVG CON DEGRADADO CÍTRICO PREMIUM
      // ============================================================
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

      // ============================================================
      // COMPOSICIÓN FINAL
      // ============================================================
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

    } catch (error: any) {
      logger.error('❌ Error creando imagen de bienvenida:', error.message);
      return null;
    }
  }
}

// Exportar instancia única (Singleton)
const welcomeImageService = new WelcomeImageService();
export { welcomeImageService, WelcomeImageService };
export default WelcomeImageService;

