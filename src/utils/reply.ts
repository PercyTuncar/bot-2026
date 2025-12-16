import { proto } from '@whiskeysockets/baileys';
import { EMOJIS } from '../config/constants.js';

/**
 * Baileys Message Helpers
 * All functions use the correct Baileys sendMessage pattern: { text, mentions, etc }
 */

/**
 * Send a text message (quoted reply to original message)
 */
export async function reply(sock: any, msg: any, text: string, options: any = {}) {
  const chatId = msg?.from || msg?.key?.remoteJid;
  const key = msg?.key || { id: msg?.id?.id, fromMe: msg?.fromMe, remoteJid: chatId };

  const messageContent: any = {
    text,
    ...options
  };

  // Quote the original message
  if (key?.id) {
    messageContent.quoted = { key };
  }

  return await sock.sendMessage(chatId, messageContent);
}

/**
 * Send a text message without quoting (simple send)
 */
export async function sendText(sock: any, jid: string, text: string, options: any = {}) {
  return await sock.sendMessage(jid, { text, ...options });
}

/**
 * Send a text message with mentions
 */
export async function sendTextWithMentions(sock: any, jid: string, text: string, mentions: string[]) {
  return await sock.sendMessage(jid, { text, mentions });
}

/**
 * Send an image message
 */
export async function sendImage(sock: any, jid: string, imageBuffer: Buffer, caption?: string, mentions?: string[]) {
  const content: any = { image: imageBuffer };
  if (caption) content.caption = caption;
  if (mentions) content.mentions = mentions;
  return await sock.sendMessage(jid, content);
}

/**
 * Send a video message
 */
export async function sendVideo(sock: any, jid: string, videoBuffer: Buffer, caption?: string) {
  const content: any = { video: videoBuffer };
  if (caption) content.caption = caption;
  return await sock.sendMessage(jid, content);
}

/**
 * Send an audio message
 */
export async function sendAudio(sock: any, jid: string, audioBuffer: Buffer, ptt: boolean = false) {
  return await sock.sendMessage(jid, { audio: audioBuffer, ptt });
}

/**
 * Send a document message
 */
export async function sendDocument(sock: any, jid: string, buffer: Buffer, mimetype: string, fileName: string) {
  return await sock.sendMessage(jid, { document: buffer, mimetype, fileName });
}

/**
 * React to a message with an emoji
 */
export async function react(sock: any, msg: any, emoji: string) {
  const chatId = msg?.from || msg?.key?.remoteJid;
  const key = msg?.key || { id: msg?.id?.id, fromMe: msg?.fromMe, remoteJid: chatId };

  return await sock.sendMessage(chatId, {
    react: { text: emoji, key }
  });
}

/**
 * React loading (hourglass emoji)
 */
export async function reactLoading(sock: any, msg: any) {
  return await react(sock, msg, EMOJIS.LOADING || '⏳');
}

/**
 * React success (check emoji)
 */
export async function reactSuccess(sock: any, msg: any) {
  return await react(sock, msg, EMOJIS.SUCCESS || '✅');
}

/**
 * React error (X emoji)
 */
export async function reactError(sock: any, msg: any) {
  return await react(sock, msg, EMOJIS.ERROR || '❌');
}

/**
 * Standard command execution wrapper
 * Use this to wrap command execution with loading/success/error reactions
 */
export async function executeWithReaction(sock: any, msg: any, fn: () => Promise<any>) {
  try {
    await reactLoading(sock, msg);
    const result = await fn();
    await reactSuccess(sock, msg);
    return result;
  } catch (error) {
    await reactError(sock, msg);
    throw error;
  }
}

/**
 * Reply with error format
 */
export async function replyError(sock: any, msg: any, errorText: string) {
  await reactError(sock, msg);
  return await reply(sock, msg, `❌ ${errorText}`);
}

/**
 * Reply with success format
 */
export async function replySuccess(sock: any, msg: any, text: string) {
  await reactSuccess(sock, msg);
  return await reply(sock, msg, `✅ ${text}`);
}
