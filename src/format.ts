/** Small pure helpers shared across modules. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
export const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
export const revoke = (u: string | undefined | null) => {
  if (u) URL.revokeObjectURL(u);
};
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
