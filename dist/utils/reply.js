import { EMOJIS } from '../config/constants.js';
export async function reply(sock, msg, text, options = {}) {
    const chatId = msg?.from || msg?.key?.remoteJid;
    const key = msg?.key || { id: msg?.id?.id, fromMe: msg?.fromMe, remoteJid: chatId };
    const messageContent = {
        text,
        ...options
    };
    if (key?.id) {
        messageContent.quoted = { key };
    }
    return await sock.sendMessage(chatId, messageContent);
}
export async function sendText(sock, jid, text, options = {}) {
    return await sock.sendMessage(jid, { text, ...options });
}
export async function sendTextWithMentions(sock, jid, text, mentions) {
    return await sock.sendMessage(jid, { text, mentions });
}
export async function sendImage(sock, jid, imageBuffer, caption, mentions) {
    const content = { image: imageBuffer };
    if (caption)
        content.caption = caption;
    if (mentions)
        content.mentions = mentions;
    return await sock.sendMessage(jid, content);
}
export async function sendVideo(sock, jid, videoBuffer, caption) {
    const content = { video: videoBuffer };
    if (caption)
        content.caption = caption;
    return await sock.sendMessage(jid, content);
}
export async function sendAudio(sock, jid, audioBuffer, ptt = false) {
    return await sock.sendMessage(jid, { audio: audioBuffer, ptt });
}
export async function sendDocument(sock, jid, buffer, mimetype, fileName) {
    return await sock.sendMessage(jid, { document: buffer, mimetype, fileName });
}
export async function react(sock, msg, emoji) {
    const chatId = msg?.from || msg?.key?.remoteJid;
    const key = msg?.key || { id: msg?.id?.id, fromMe: msg?.fromMe, remoteJid: chatId };
    return await sock.sendMessage(chatId, {
        react: { text: emoji, key }
    });
}
export async function reactLoading(sock, msg) {
    return await react(sock, msg, EMOJIS.LOADING || '⏳');
}
export async function reactSuccess(sock, msg) {
    return await react(sock, msg, EMOJIS.SUCCESS || '✅');
}
export async function reactError(sock, msg) {
    return await react(sock, msg, EMOJIS.ERROR || '❌');
}
export async function executeWithReaction(sock, msg, fn) {
    try {
        await reactLoading(sock, msg);
        const result = await fn();
        await reactSuccess(sock, msg);
        return result;
    }
    catch (error) {
        await reactError(sock, msg);
        throw error;
    }
}
export async function replyError(sock, msg, errorText) {
    await reactError(sock, msg);
    return await reply(sock, msg, `❌ ${errorText}`);
}
export async function replySuccess(sock, msg, text) {
    await reactSuccess(sock, msg);
    return await reply(sock, msg, `✅ ${text}`);
}
