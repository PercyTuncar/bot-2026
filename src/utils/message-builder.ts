export function bold(text: string): string {
  return `*${text}*`;
}

export function italic(text: string): string {
  return `_${text}_`;
}

export function strike(text: string): string {
  return `~${text}~`;
}

export function codeInline(text: string): string {
  return `\`${text}\``;
}

export function codeBlock(text: string): string {
  return `\`\`\`\n${text}\n\`\`\``;
}

export function quote(text: string): string {
  return `> ${text}`;
}

export function bulletList(items: string[]): string {
  return items.map(i => `- ${i}`).join('\n');
}

export function numberList(items: string[]): string {
  return items.map((i, idx) => `${idx + 1}. ${i}`).join('\n');
}

export function section(title: string, lines: string[]): string {
  const hdr = `${bold(title)}`;
  const body = lines.join('\n');
  return `${hdr}\n${body}`;
}

export function joinSections(sections: string[]): string {
  return sections.filter(Boolean).join('\n\n');
}

