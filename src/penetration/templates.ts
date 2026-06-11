export interface DiaryTurnContent {
  userText: string;
  assistantText: string;
  roleName?: string;
  headerLine?: string;
}

export function formatDiaryEntry(content: DiaryTurnContent): string {
  const ts = new Date().toISOString();
  const role = content.roleName?.trim() || '角色';
  const header = content.headerLine?.trim();
  const lines = [
    '',
    `## ${ts}`,
    header ? `> ${header}` : undefined,
    '',
    `**你**：${content.userText.trim()}`,
    '',
    `**${role}**：${content.assistantText.trim()}`,
    '',
  ].filter((l): l is string => l !== undefined);
  return lines.join('\n');
}

/** Summarize today's diary blocks for optional memory sync (C2). */
export function summarizeDiaryForMemory(diaryMarkdown: string, maxChars = 1200): string {
  const today = new Date().toISOString().slice(0, 10);
  const sections = diaryMarkdown.split(/^## /m).filter(Boolean);
  const todaySections = sections.filter((s) => s.startsWith(today));
  const source = todaySections.length ? todaySections : sections.slice(-3);
  const body = source
    .map((s) => s.trim())
    .join('\n---\n')
    .replace(/\s+/g, ' ')
    .trim();
  if (body.length <= maxChars) {
    return `【工作区日记摘要 ${today}】${body}`;
  }
  return `【工作区日记摘要 ${today}】${body.slice(0, maxChars)}…`;
}
