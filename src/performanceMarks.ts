/** Dev/acceptance timing marks (see docs/F5_ACCEPTANCE.md). */

export const PERF_MARK = {
  bootstrapStart: 'oclive.bootstrap.start',
  bootstrapReady: 'oclive.bootstrap.ready',
  ensureReadyStart: 'oclive.ensureReady.start',
  ensureReadyDone: 'oclive.ensureReady.done',
  sendStart: 'oclive.chat.send.start',
  firstToken: 'oclive.chat.firstToken',
  sendDone: 'oclive.chat.send.done',
} as const;

export function perfMark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    /* non-vscode / older runtimes */
  }
}

export function perfMeasure(name: string, startMark: string, endMark: string): number | undefined {
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(name, 'measure');
    const last = entries[entries.length - 1];
    return last?.duration;
  } catch {
    return undefined;
  }
}

export function logPerfMeasure(label: string, startMark: string, endMark: string): void {
  const ms = perfMeasure(`oclive.${label}`, startMark, endMark);
  if (ms !== undefined) {
    console.info(`[oclive perf] ${label}: ${Math.round(ms)}ms`);
  }
}
