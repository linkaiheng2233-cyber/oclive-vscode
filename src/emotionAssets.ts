/**
 * Aligned with oclivenewnew `src/utils/emotion-assets.ts` and backend `Emotion` tags.
 * Portrait uses `portrait_emotion` when set, else `bot_emotion`.
 */

const EMOTION_EMOJI: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  angry: '😠',
  shy: '☺️',
  confused: '😕',
  disgust: '🙄',
  neutral: '😐',
  excited: '🤩',
};

const EMOTION_IMAGE: Record<string, string> = {
  happy: 'happy.png',
  sad: 'sad.png',
  angry: 'angry.png',
  shy: 'shy.png',
  confused: 'confused.png',
  disgust: 'disgust_light.png',
  neutral: 'normal.png',
  excited: 'excited.png',
  disgust_light: 'disgust_light.png',
  disgust_mid: 'disgust_mid.png',
  disgust_heavy: 'disgust_heavy.png',
};

export function normalizeEmotionKey(raw: string): string {
  return raw.trim().toLowerCase() || 'neutral';
}

export function emotionEmoji(key: string): string {
  const k = normalizeEmotionKey(key);
  return EMOTION_EMOJI[k] ?? '😐';
}

export function emotionImageCandidates(key: string): string[] {
  const k = normalizeEmotionKey(key);
  const primary = EMOTION_IMAGE[k] ?? `${k}.png`;
  const out = new Set<string>();

  const expand = (file: string) => {
    const dot = file.lastIndexOf('.');
    const base = dot >= 0 ? file.slice(0, dot) : file;
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
      out.add(`${base}.${ext}`);
    }
  };

  expand(primary);
  if (k === 'neutral') {
    expand('neutral.png');
  }
  if (k.startsWith('disgust')) {
    expand('disgust_light.png');
    expand('disgust_mid.png');
    expand('disgust_heavy.png');
  }
  expand('normal.png');
  expand('neutral.png');
  return Array.from(out);
}
