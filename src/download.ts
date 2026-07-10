import { state, type Item } from './state';

/** Save a single item's encoded output. */
export function downloadItem(it: Item): void {
  if (!it.encodedUrl || !it.outName) return;
  const a = document.createElement('a');
  a.href = it.encodedUrl;
  a.download = it.outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Zip every finished item (stored, no re-deflate) and download it. fflate loads on demand. */
export async function downloadZip(): Promise<void> {
  const done = state.items.filter((i) => i.status === 'done' && i.encoded && i.outName);
  if (!done.length) return;
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const it of done) {
    let name = it.outName as string;
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let k = 2;
      while (used.has(`${stem} (${k})${ext}`)) k++;
      name = `${stem} (${k})${ext}`;
    }
    used.add(name);
    files[name] = new Uint8Array(await (it.encoded as Blob).arrayBuffer());
  }
  const { zip } = await import('fflate');
  zip(files, { level: 0 }, (err, data) => {
    if (err) return;
    const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'squish.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
}
