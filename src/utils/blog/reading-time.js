const CHARACTERS_PER_MINUTE = 300;

export function estimateReadingTime(length) {
  return Math.max(1, Math.ceil(Number(length) / CHARACTERS_PER_MINUTE) || 1);
}
