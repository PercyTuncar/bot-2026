export function bold(text) {
    return `*${text}*`;
}
export function italic(text) {
    return `_${text}_`;
}
export function strike(text) {
    return `~${text}~`;
}
export function codeInline(text) {
    return `\`${text}\``;
}
export function codeBlock(text) {
    return `\`\`\`\n${text}\n\`\`\``;
}
export function quote(text) {
    return `> ${text}`;
}
export function bulletList(items) {
    return items.map(i => `- ${i}`).join('\n');
}
export function numberList(items) {
    return items.map((i, idx) => `${idx + 1}. ${i}`).join('\n');
}
export function section(title, lines) {
    const hdr = `${bold(title)}`;
    const body = lines.join('\n');
    return `${hdr}\n${body}`;
}
export function joinSections(sections) {
    return sections.filter(Boolean).join('\n\n');
}
