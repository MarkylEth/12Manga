import sharp from 'sharp';

export type WebpOptions = {
  maxWidth?: number;     // сжатие по ширине, без увеличения
  quality?: number;      // 1..100
};

export async function toWebp(buffer: Buffer, opts: WebpOptions = {}) {
  const maxWidth = opts.maxWidth ?? 1200;
  const quality  = opts.quality  ?? 82;

  const s = sharp(buffer, { failOn: 'none' });

  // уменьшаем если ширина больше maxWidth
  const meta = await s.metadata();
  const resized = (meta.width && meta.width > maxWidth)
    ? s.resize({ width: maxWidth, withoutEnlargement: true })
    : s;

  const webpBuf = await resized.webp({ quality }).toBuffer();
  const outMeta = await sharp(webpBuf).metadata();

  return {
    buffer: webpBuf,
    width: outMeta.width ?? null,
    height: outMeta.height ?? null,
    contentType: 'image/webp',
  };
}
    