// The package's Node entry imports fs/PNG streams. Only load the pure JS encoder.
import { create } from 'qrcode/lib/core/qrcode.js';

export function qrImageUri(payload: string): string {
  const { modules } = create(payload, { errorCorrectionLevel: 'M' });
  const size = modules.size;
  const paths: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (modules.data[row * size + column]) paths.push(`M${column + 4} ${row + 4}h1v1h-1z`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(size + 8) * 8}" height="${(size + 8) * 8}" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
