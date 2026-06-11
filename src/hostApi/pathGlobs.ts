/** Simple glob check: patterns like `.oclive/**` against a workspace-relative posix path. */
export function pathMatchesAllowedGlobs(relativePosix: string, globs: string[]): boolean {
  const norm = relativePosix.replace(/\\/g, '/');
  for (const g of globs) {
    const pattern = g.replace(/\\/g, '/').trim();
    if (!pattern) {
      continue;
    }
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (norm === prefix || norm.startsWith(`${prefix}/`)) {
        return true;
      }
    } else if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (norm.startsWith(`${prefix}/`) && !norm.slice(prefix.length + 1).includes('/')) {
        return true;
      }
    } else if (norm === pattern) {
      return true;
    }
  }
  return false;
}
