/**
 * Build a speech-only version of a Friday response.
 * The rendered chat keeps the original Markdown. TTS receives this
 * normalized conversational text so formatting syntax is never spoken.
 */
export function toSpeechText(input: string): string {
  if (!input) return '';

  let text = input.replace(/\r\n?/g, '\n');
  const tick = String.fromCharCode(96);
  const fencedCode = new RegExp(tick + tick + tick + '[\\s\\S]*?' + tick + tick + tick, 'g');
  const inlineCode = new RegExp(tick + '([^' + tick + ']+)' + tick, 'g');

  text = text.replace(fencedCode, ' ');
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s*>+\s?/gm, '');
  text = text.replace(/^\s*(?:[-*+] |\d+[.)]\s+)/gm, '');
  text = text.replace(/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/gm, '');
  text = text.replace(/\|/g, ', ');

  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/_([^_\n]+)_/g, '$1');
  text = text.replace(/~~([^~\n]+)~~/g, '$1');
  text = text.replace(inlineCode, '$1');
  text = text.replace(/[\\{}\[\]]/g, '');
  text = text.replace(/^\s*[*_#~`>-]+/gm, '');
  text = text.replace(/\n+/g, '. ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/\s+([,.;!?])/g, '$1');
  text = text.replace(/([,;:])(?=\S)/g, '$1 ');
  text = text.replace(/\.{2,}/g, '.');

  return text.trim();
}