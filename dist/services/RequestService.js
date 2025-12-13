import RequestRepository from '../repositories/RequestRepository.js';
import PrizeService from './PrizeService.js';
import { phoneToJid } from '../utils/phone.js';
import logger from '../lib/logger.js';
export class RequestService {
    static async getPendingRequests(limit = 50) {
        return await RequestRepository.getByStatus('pending', limit);
    }
    static async getUserRequests(phone) {
        return await RequestRepository.getByUser(phone);
    }
    static async approveRequest(requestId, approvedBy, sock = null) {
        const request = await RequestRepository.getById(requestId);
        if (!request) {
            throw new Error('Solicitud no encontrada');
        }
        await RequestRepository.approve(requestId, approvedBy);
        logger.info(`Solicitud aprobada: ${requestId} por ${approvedBy}`);
        if (sock && request.phone) {
            try {
                const userJid = phoneToJid(request.phone);
                const notificationMessage = `✅ *Solicitud de Premio Aprobada*\n\n` +
                    `Premio: ${request.prizeName} (${request.prizeCode})\n` +
                    `Grupo: ${request.groupName}\n` +
                    `ID de solicitud: ${request.id}\n\n` +
                    `Tu solicitud ha sido aprobada. El premio será entregado pronto.\n` +
                    `Los puntos se descontarán cuando el premio sea marcado como entregado.`;
                await sock.sendMessage(userJid, notificationMessage);
                logger.info(`Notificación de aprobación enviada a ${request.phone}`);
            }
            catch (error) {
                logger.warn(`No se pudo notificar al usuario ${request.phone}:`, error);
            }
        }
    }
    static async rejectRequest(requestId, rejectedBy, reason, sock = null) {
        const request = await RequestRepository.getById(requestId);
        if (!request) {
            throw new Error('Solicitud no encontrada');
        }
        await RequestRepository.reject(requestId, rejectedBy, reason);
        logger.info(`Solicitud rechazada: ${requestId} por ${rejectedBy}`);
        if (sock && request.phone) {
            try {
                const userJid = phoneToJid(request.phone);
                const notificationMessage = `❌ *Solicitud de Premio Rechazada*\n\n` +
                    `Premio: ${request.prizeName} (${request.prizeCode})\n` +
                    `Grupo: ${request.groupName}\n` +
                    `Motivo: ${reason || 'No especificado'}\n\n` +
                    `Tu solicitud ha sido rechazada. Los puntos no fueron descontados.`;
                await sock.sendMessage(userJid, notificationMessage);
                logger.info(`Notificación de rechazo enviada a ${request.phone}`);
            }
            catch (error) {
                logger.warn(`No se pudo notificar al usuario ${request.phone}:`, error);
            }
        }
    }
    static async deliverRequest(requestId, deliveredBy, sock = null) {
        const request = await RequestRepository.getById(requestId);
        if (!request) {
            throw new Error('Solicitud no encontrada');
        }
        const result = await PrizeService.deliverPrize(requestId, deliveredBy);
        if (sock && request.phone) {
            try {
                const userJid = phoneToJid(request.phone);
                const notificationMessage = `🎉 *Premio Entregado*\n\n` +
                    `Premio: ${request.prizeName} (${request.prizeCode})\n` +
                    `Grupo: ${request.groupName}\n` +
                    `Puntos descontados: ${request.pointsSpent}\n\n` +
                    `¡Disfruta tu premio!`;
                await sock.sendMessage(userJid, notificationMessage);
                logger.info(`Notificación de entrega enviada a ${request.phone}`);
            }
            catch (error) {
                logger.warn(`No se pudo notificar al usuario ${request.phone}:`, error);
            }
        }
        return result;
    }
}
export default RequestService;
