import sharp from "sharp";
import fs from "fs";

const src = "public/logo/indexla-logo-transparent.png";
const sizes = [16, 32, 48];
const pngs = [];

for (const size of sizes) {
  const buf = await sharp(src)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(`public/favicon-${size}.png`, buf);
  pngs.push({ size, buf });
}

for (const [file, size] of [
  ["src/app/apple-icon.png", 180],
  ["src/app/icon.png", 192],
  ["public/apple-icon.png", 180],
  ["public/icon.png", 192],
  ["public/icon-512.png", 512],
]) {
  await sharp(src)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(file);
}

const headerSize = 6;
const entrySize = 16;
const offset0 = headerSize + entrySize * pngs.length;
let offset = offset0;
const dirEntries = pngs.map((e) => {
  const entry = {
    width: e.size >= 256 ? 0 : e.size,
    height: e.size >= 256 ? 0 : e.size,
    bytes: e.buf.length,
    offset,
  };
  offset += e.buf.length;
  return entry;
});

const out = Buffer.alloc(offset);
out.writeUInt16LE(0, 0);
out.writeUInt16LE(1, 2);
out.writeUInt16LE(pngs.length, 4);
let p = 6;
for (const d of dirEntries) {
  out.writeUInt8(d.width, p); p += 1;
  out.writeUInt8(d.height, p); p += 1;
  out.writeUInt8(0, p); p += 1;
  out.writeUInt8(0, p); p += 1;
  out.writeUInt16LE(1, p); p += 2;
  out.writeUInt16LE(32, p); p += 2;
  out.writeUInt32LE(d.bytes, p); p += 4;
  out.writeUInt32LE(d.offset, p); p += 4;
}
pngs.forEach((e, i) => e.buf.copy(out, dirEntries[i].offset));
fs.writeFileSync("public/favicon.ico", out);
console.log("Wrote favicon.ico", out.length, "bytes");
