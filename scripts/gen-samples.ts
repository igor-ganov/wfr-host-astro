/**
 * Generate binary sample assets for the reference host:
 *  - report.pdf   — a multi-page (3-page) PDF
 *  - photo.png    — a small RGBA PNG image
 *  - report.docx  — a minimal but valid Word document
 *  - bundle.zip   — an archive bundling several existing text samples
 *
 * Run with: `bun scripts/gen-samples.ts` (from the host package root).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const here = dirname(fileURLToPath(import.meta.url));
const samples = join(here, '..', 'public', 'samples');
const out = (name: string): string => join(samples, name);

// --- PNG ---------------------------------------------------------------------
const crcTable: readonly number[] = Array.from({ length: 256 }, (_unused, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u32 = (value: number): Uint8Array =>
  Uint8Array.from([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = strToU8(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  return concat([u32(data.length), body, u32(crc32(body))]);
};

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
};

const makePng = (size: number): Uint8Array => {
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = concat([u32(size), u32(size), Uint8Array.from([8, 6, 0, 0, 0])]);
  const raw = new Uint8Array((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y += 1) {
    raw[p] = 0; // filter: none
    p += 1;
    for (let x = 0; x < size; x += 1) {
      raw[p] = Math.round((x / (size - 1)) * 255); // R gradient
      raw[p + 1] = Math.round((y / (size - 1)) * 255); // G gradient
      raw[p + 2] = 160; // B
      raw[p + 3] = 255; // A
      p += 4;
    }
  }
  const idat = new Uint8Array(deflateSync(raw));
  return concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
};

// --- PDF ---------------------------------------------------------------------
const makePdf = (pageTexts: readonly string[]): Uint8Array => {
  const objects: string[] = [];
  const pageObjNums: number[] = [];
  // Reserve: 1=Catalog, 2=Pages, 3=Font, then page+content pairs.
  pageTexts.forEach((_text, i) => pageObjNums.push(4 + i * 2));
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(' ');

  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageTexts.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  pageTexts.forEach((text, i) => {
    const pageNum = 4 + i * 2;
    const contentNum = pageNum + 1;
    const stream = `BT /F1 28 Tf 72 720 Td (${text}) Tj ET\nBT /F1 14 Tf 72 680 Td (Page ${i + 1} of ${pageTexts.length}) Tj ET`;
    objects[pageNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`;
    objects[contentNum] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  const header = `%PDF-1.4\n`;
  let body = header;
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n += 1) {
    offsets[n] = body.length;
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xrefStart = body.length;
  const count = objects.length; // includes index 0 placeholder
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n += 1) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return strToU8(body + xref + trailer);
};

// --- DOCX --------------------------------------------------------------------
const docxDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Quarterly Report</w:t></w:r></w:p>
<w:p><w:r><w:t>This document was rendered by the web-file-reader </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>DOCX</w:t></w:r><w:r><w:t> provider, which reads </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>word/document.xml</w:t></w:r><w:r><w:t> directly.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Highlights</w:t></w:r></w:p>
<w:p><w:r><w:t>Revenue grew across every region this quarter, with strong momentum in EMEA.</w:t></w:r></w:p>
<w:p><w:r><w:t>Customer retention reached an all-time high of 96%.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Outlook</w:t></w:r></w:p>
<w:p><w:r><w:t>We expect continued growth driven by the new product line and expanded partnerships.</w:t></w:r></w:p>
</w:body></w:document>`;

const docxContentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const docxRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const makeDocx = (): Uint8Array =>
  zipSync({
    '[Content_Types].xml': strToU8(docxContentTypes),
    '_rels/.rels': strToU8(docxRels),
    'word/document.xml': strToU8(docxDocument),
  });

// --- ZIP archive of existing text samples ------------------------------------
const makeBundle = (): Uint8Array => {
  const names = ['readme.md', 'notes.txt', 'sales.csv', 'logo.svg'];
  const entries: Record<string, Uint8Array> = {};
  for (const name of names) entries[name] = new Uint8Array(readFileSync(out(name)));
  entries['INFO.txt'] = strToU8('Sample archive bundled by web-file-reader.\n');
  return zipSync(entries);
};

// --- write -------------------------------------------------------------------
writeFileSync(out('photo.png'), makePng(96));
writeFileSync(out('report.pdf'), makePdf(['Web File Reader', 'Multi-page PDF', 'The End']));
writeFileSync(out('report.docx'), makeDocx());
writeFileSync(out('bundle.zip'), makeBundle());
// eslint-disable-next-line no-console
console.log('Generated: photo.png, report.pdf, report.docx, bundle.zip');
