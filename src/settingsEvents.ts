import type { SettingsSection } from './webviewProtocol';

type SettingsChangedListener = () => void;

let listeners: SettingsChangedListener[] = [];
let pendingSection: SettingsSection | undefined;

export function onSettingsChanged(listener: SettingsChangedListener): { dispose: () => void } {
  listeners.push(listener);
  return {
    dispose: () => {
      listeners = listeners.filter((l) => l !== listener);
    },
  };
}

export function emitSettingsChanged(): void {
  for (const l of listeners) {
    l();
  }
}

export function setPendingSettingsSection(section: SettingsSection | undefined): void {
  pendingSection = section;
}

export function takePendingSettingsSection(): SettingsSection | undefined {
  const s = pendingSection;
  pendingSection = undefined;
  return s;
}
