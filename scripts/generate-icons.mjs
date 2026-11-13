import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x / size,
        py = y / size;
      const circle = (px - 0.5) ** 2 + (py - 0.5) ** 2 < 0.31 ** 2;
      const seam =
        circle &&
        (Math.abs(px - (0.39 + 0.1 * Math.cos((py - 0.5) * 6))) < 0.008 ||
          Math.abs(px - (0.61 - 0.1 * Math.cos((py - 0.5) * 6))) < 0.008) &&
        Math.floor(py * 50) % 2 === 0;
      const color = circle && !seam ? [116, 219, 177] : [16, 27, 35];
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set([...color, 255], offset);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    new URL(`../apps/web/public/icon-${size}.png`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(pixels)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
