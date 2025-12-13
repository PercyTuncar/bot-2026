import GroupRepository from '../repositories/GroupRepository.js';
import ConfigRepository from '../repositories/ConfigRepository.js';
import { DEFAULT_GROUP_CONFIG } from '../config/constants.js';
import logger from '../lib/logger.js';
export class ConfigService {
    static async getGroupConfig(groupId) {
        let config = await GroupRepository.getConfig(groupId);
        if (!config) {
            config = DEFAULT_GROUP_CONFIG;
            await GroupRepository.updateConfig(groupId, config);
        }
        return config;
    }
    static async updateGroupConfig(groupId, updates) {
        const current = await this.getGroupConfig(groupId);
        const newConfig = { ...current };
        for (const [key, value] of Object.entries(updates)) {
            if (key.includes('.')) {
                const [parent, child] = key.split('.');
                if (!newConfig[parent]) {
                    newConfig[parent] = {};
                }
                newConfig[parent][child] = value;
            }
            else {
                newConfig[key] = value;
            }
        }
        await GroupRepository.updateConfig(groupId, newConfig);
        logger.info(`Configuración actualizada para grupo ${groupId}`);
        return newConfig;
    }
    static async getGlobalConfig() {
        return await ConfigRepository.getGlobal();
    }
    static async updateGlobalConfig(updates) {
        await ConfigRepository.updateGlobal(updates);
        logger.info('Configuración global actualizada');
    }
}
export default ConfigService;
