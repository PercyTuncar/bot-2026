import qrcode from 'qrcode-terminal';
import logger from './logger.js';
export function displayQR(qr) {
    try {
        console.log('\n📱 Escanea este código QR con WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n');
        logger.info('QR code generado y mostrado en consola');
    }
    catch (error) {
        logger.error('Error al mostrar QR:', error);
        logger.info(`QR code string: ${qr.substring(0, 50)}...`);
    }
}
export default { displayQR };
