const FENCE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/g;

// Models often emit \( ... \) and \[ ... \] math delimiters, but the renderer
// only understands $ ... $ and $$ ... $$.
export function normalizeMath(content: string): string {
  return content
    .split(FENCE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => `$$${tex}$$`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => `$${tex}$`),
    )
    .join('');
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'Now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString();
}
