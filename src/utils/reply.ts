export async function reply(sock: any, msg: any, text: string, options: any = {}) {
  const quotedId = msg?.id?._serialized || msg?.id?.id;
  let chatId = msg?.from;
  try {
    if (typeof msg.getChat === 'function') {
      const chat = await msg.getChat();
      if (chat?.isGroup) {
        const groupJid = chat?.id?._serialized || chat?.id;
        if (typeof groupJid === 'string' && groupJid.endsWith('@g.us')) {
          chatId = groupJid;
        }
      } else if (typeof msg.getContact === 'function') {
        const contact = await msg.getContact();
        const contactId = contact?.id?._serialized || contact?.id;
        if (typeof contactId === 'string' && contactId.endsWith('@c.us')) {
          chatId = contactId;
        } else if (typeof chatId === 'string' && chatId.endsWith('@lid') && typeof contactId === 'string') {
          chatId = contactId;
        }
      }
    }
  } catch {}
  return await sock.sendMessage(chatId, text, { ...options, quotedMessageId: quotedId });
}

