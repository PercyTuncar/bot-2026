import sharp from 'sharp';
import { config } from '../config/environment.js';
import logger from '../lib/logger.js';
class MatchImageService {
    backgroundUrl;
    constructor() {
        this.backgroundUrl = '';
    }
    getMultiavatarUrl(seed) {
        const cleanSeed = encodeURIComponent(seed.replace(/@.*$/, '').replace(/[^a-zA-Z0-9]/g, '') || `avatar_${Date.now()}`);
        return `https://api.multiavatar.com/${cleanSeed}.png`;
    }
    async getProfilePicture(client, userId, userName) {
        let avatarUrl = null;
        if (client && userId) {
            try {
                let contactId = userId;
                if (!contactId.includes('@')) {
                    contactId = `${contactId}@c.us`;
                }
                const profilePicUrl = await client.getProfilePicUrl(contactId);
                if (profilePicUrl) {
                    avatarUrl = profilePicUrl;
                    logger.info(`[Match] Profile pic found for ${userName}`);
                }
            }
            catch (e) {
                logger.debug(`[Match] No profile pic for ${userId}: ${e.message}`);
            }
        }
        if (!avatarUrl) {
            let seed = userName || userId || `user_${Date.now()}`;
            if (seed === 'undefined' || seed === 'null') {
                seed = `user_${Date.now()}`;
            }
            seed = seed.replace(/@c\.us$/, '').replace(/@lid$/, '');
            avatarUrl = this.getMultiavatarUrl(seed);
            logger.info(`[Match] Using Multiavatar PNG for ${userName}`);
        }
        try {
            const response = await fetch(avatarUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return Buffer.from(await response.arrayBuffer());
        }
        catch (error) {
            logger.warn(`[Match] Failed to fetch avatar: ${error.message}, using fallback`);
            const fallbackSvg = this.createFallbackAvatar(userName || 'U');
            return sharp(Buffer.from(fallbackSvg))
                .resize(260, 260)
                .png()
                .toBuffer();
        }
    }
    createFallbackAvatar(name) {
        const initials = name.substring(0, 2).toUpperCase();
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
        const color = colors[Math.abs(name.charCodeAt(0) || 0) % colors.length];
        return `
      <svg width="260" height="260" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color}"/>
            <stop offset="100%" style="stop-color:#333"/>
          </linearGradient>
        </defs>
        <circle cx="130" cy="130" r="130" fill="url(#avatarGrad)"/>
        <text x="130" y="150" font-family="Arial Black, Arial, sans-serif" 
              font-size="80" fill="white" text-anchor="middle" font-weight="bold">
          ${initials}
        </text>
      </svg>
    `;
    }
    async createMatchImage(user1, user2, client, compatibility) {
        try {
            this.backgroundUrl = config.cloudinary.matchBgUrl || config.cloudinary.welcomeBgUrl;
            if (!this.backgroundUrl) {
                logger.warn('[Match] No MATCH_BG_URL configured');
                return null;
            }
            logger.info(`[Match] Generating match image: ${user1.name} ❤️ ${user2.name}`);
            const [bgRes, avatar1Buf, avatar2Buf] = await Promise.all([
                fetch(this.backgroundUrl),
                this.getProfilePicture(client, user1.id, user1.name),
                this.getProfilePicture(client, user2.id, user2.name)
            ]);
            if (!bgRes.ok) {
                logger.error(`[Match] Failed to fetch background: ${bgRes.status}`);
                return null;
            }
            const bgBuf = Buffer.from(await bgRes.arrayBuffer());
            const canvasWidth = 1080;
            const canvasHeight = 1080;
            const avatarSize = 260;
            const avatarRadius = avatarSize / 2;
            const avatar1X = 170;
            const avatar2X = 650;
            const avatarY = 340;
            const processAvatar = async (buf) => {
                const resized = await sharp(buf)
                    .resize(avatarSize, avatarSize, { fit: 'cover' })
                    .png()
                    .toBuffer();
                const circleMask = Buffer.from(`<svg width="${avatarSize}" height="${avatarSize}">
            <circle cx="${avatarRadius}" cy="${avatarRadius}" r="${avatarRadius}" fill="white"/>
          </svg>`);
                return sharp(resized)
                    .composite([{
                        input: circleMask,
                        blend: 'dest-in'
                    }])
                    .png()
                    .toBuffer();
            };
            const [circleAvatar1, circleAvatar2] = await Promise.all([
                processAvatar(avatar1Buf),
                processAvatar(avatar2Buf)
            ]);
            const ringSize = avatarSize + 40;
            const createHeartRing = () => {
                const hearts = [];
                const ringRadius = ringSize / 2;
                const heartSize = 28;
                const numHearts = 8;
                for (let i = 0; i < numHearts; i++) {
                    const angle = (i * 2 * Math.PI) / numHearts - Math.PI / 2;
                    const x = ringRadius + (ringRadius - 10) * Math.cos(angle) - heartSize / 2;
                    const y = ringRadius + (ringRadius - 10) * Math.sin(angle) - heartSize / 2;
                    hearts.push(`
            <g transform="translate(${x}, ${y}) scale(0.7)">
              <path d="M20 35.5c-1.5-1.2-3.5-2.7-5.5-4.5C8.5 25.5 2 19.5 2 12.5 2 7.5 5.5 4 10 4c2.5 0 5 1.2 7 3.5 2-2.3 4.5-3.5 7-3.5 4.5 0 8 3.5 8 8.5 0 7-6.5 13-12.5 18.5-2 1.8-4 3.3-5.5 4.5z" 
                    fill="#FF6B6B" stroke="#FF4757" stroke-width="1"/>
            </g>
          `);
                }
                return `
          <svg width="${ringSize}" height="${ringSize}">
            <!-- Anillo naranja/coral -->
            <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${avatarRadius + 8}" 
                    fill="none" stroke="url(#heartGradient)" stroke-width="6"/>
            <defs>
              <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#FF6B6B"/>
                <stop offset="50%" style="stop-color:#FF8E53"/>
                <stop offset="100%" style="stop-color:#FF6B6B"/>
              </linearGradient>
            </defs>
            ${hearts.join('')}
          </svg>
        `;
            };
            const heartRingSvg = createHeartRing();
            const heartRingBuf = await sharp(Buffer.from(heartRingSvg)).png().toBuffer();
            const centralHeartSize = 80;
            const centralHeartSvg = `
        <svg width="${centralHeartSize}" height="${centralHeartSize}" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="centralHeartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#FF6B6B"/>
              <stop offset="50%" style="stop-color:#FF4757"/>
              <stop offset="100%" style="stop-color:#FF6B6B"/>
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path d="M50 88c-3.8-3-8.8-6.8-13.8-11.2C22.5 65 5 49 5 32.5 5 19 15.5 8.5 27.5 8.5c6.3 0 12.5 3 17.5 8.8C50 11.5 56.2 8.5 62.5 8.5 74.5 8.5 85 19 85 32.5c0 16.5-17.5 32.5-31.2 44.3C48.8 81.2 53.8 85 50 88z" 
                fill="url(#centralHeartGrad)" filter="url(#glow)"/>
        </svg>
      `;
            const centralHeartBuf = await sharp(Buffer.from(centralHeartSvg)).png().toBuffer();
            const titleText = compatibility !== undefined ? '❤️ COMPATIBILIDAD ❤️' : '¡MATCH DEL DÍA!';
            const titleY = 180;
            const titleSvg = `
        <svg width="${canvasWidth}" height="100">
          <defs>
            <linearGradient id="titleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#FF6B6B"/>
              <stop offset="50%" style="stop-color:#FFD93D"/>
              <stop offset="100%" style="stop-color:#FF6B6B"/>
            </linearGradient>
            <filter id="textShadow">
              <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.5"/>
            </filter>
          </defs>
          <text x="${canvasWidth / 2}" y="60" 
                font-family="Arial Black, Arial, sans-serif" 
                font-size="58" 
                font-weight="bold"
                fill="url(#titleGradient)" 
                text-anchor="middle"
                filter="url(#textShadow)">
            ${titleText}
          </text>
        </svg>
      `;
            const titleBuf = await sharp(Buffer.from(titleSvg)).png().toBuffer();
            const name1Display = user1.name.length > 18 ? user1.name.substring(0, 15) + '...' : user1.name;
            const name2Display = user2.name.length > 18 ? user2.name.substring(0, 15) + '...' : user2.name;
            const namesY = avatarY + avatarSize + 60;
            const namesSvg = `
        <svg width="${canvasWidth}" height="80">
          <defs>
            <filter id="nameShadow">
              <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.7"/>
            </filter>
          </defs>
          <text x="${avatar1X + avatarSize / 2}" y="35" 
                font-family="Arial, sans-serif" 
                font-size="28" 
                font-weight="bold"
                fill="white" 
                text-anchor="middle"
                filter="url(#nameShadow)">
            ${this.escapeXml(name1Display)}
          </text>
          <text x="${avatar2X + avatarSize / 2}" y="35" 
                font-family="Arial, sans-serif" 
                font-size="28" 
                font-weight="bold"
                fill="white" 
                text-anchor="middle"
                filter="url(#nameShadow)">
            ${this.escapeXml(name2Display)}
          </text>
        </svg>
      `;
            const namesBuf = await sharp(Buffer.from(namesSvg)).png().toBuffer();
            const today = new Date().toLocaleDateString('es-PE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const infoY = 780;
            const infoSvg = `
        <svg width="${canvasWidth}" height="60">
          <text x="${canvasWidth / 2}" y="25" 
                font-family="Arial, sans-serif" 
                font-size="22" 
                fill="#FFD93D" 
                text-anchor="middle">
            Comando: .match
          </text>
          <text x="${canvasWidth / 2}" y="50" 
                font-family="Arial, sans-serif" 
                font-size="18" 
                fill="#CCCCCC" 
                text-anchor="middle">
            ${today}
          </text>
        </svg>
      `;
            const infoBuf = await sharp(Buffer.from(infoSvg)).png().toBuffer();
            const composites = [
                { input: titleBuf, top: titleY - 60, left: 0 },
                { input: heartRingBuf, top: avatarY - 20, left: avatar1X - 20 },
                { input: heartRingBuf, top: avatarY - 20, left: avatar2X - 20 },
                { input: circleAvatar1, top: avatarY, left: avatar1X },
                { input: circleAvatar2, top: avatarY, left: avatar2X },
                { input: centralHeartBuf, top: avatarY + avatarSize / 2 - centralHeartSize / 2, left: (canvasWidth - centralHeartSize) / 2 },
                { input: namesBuf, top: namesY, left: 0 },
                { input: infoBuf, top: infoY, left: 0 }
            ];
            if (compatibility !== undefined) {
                const compatColor = compatibility >= 71 ? '#4CAF50' : compatibility >= 41 ? '#FFD93D' : '#F44336';
                const compatSvg = `
          <svg width="200" height="100">
            <defs>
              <filter id="compatShadow">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
              </filter>
            </defs>
            <text x="100" y="60" 
                  font-family="Arial Black, Arial, sans-serif" 
                  font-size="52" 
                  font-weight="bold"
                  fill="${compatColor}" 
                  text-anchor="middle"
                  filter="url(#compatShadow)">
              ${compatibility}%
            </text>
          </svg>
        `;
                const compatBuf = await sharp(Buffer.from(compatSvg)).png().toBuffer();
                composites.push({
                    input: compatBuf,
                    top: avatarY + avatarSize + 100,
                    left: (canvasWidth - 200) / 2
                });
            }
            const result = await sharp(bgBuf)
                .resize(canvasWidth, canvasHeight, { fit: 'cover' })
                .composite(composites)
                .png({ quality: 90 })
                .toBuffer();
            logger.info(`[Match] Image generated: ${result.length} bytes`);
            return result;
        }
        catch (error) {
            logger.error(`[Match] Error generating image: ${error.message}`);
            return null;
        }
    }
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
export const matchImageService = new MatchImageService();
export default MatchImageService;
