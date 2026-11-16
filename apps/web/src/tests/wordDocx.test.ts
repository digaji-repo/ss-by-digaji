import { describe, expect, it } from 'vitest';
import {
  buildDocxBlobFromHtml,
  createEmptyDocxBlob,
  parseDocxArrayBufferToHtml,
} from '@/features/files/services/wordDocx';

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsArrayBuffer(blob);
  });
}

describe('Word .docx converter service', () => {
  it('builds a valid OOXML .docx archive and round-trips headings, lists, and tables', async () => {
    const htmlInput = `
      <h1>Rencana Proyek DropRoom</h1>
      <p>Paragraf dengan <strong>tebal</strong>, <em>miring</em>, dan <u>garis bawah</u>.</p>
      <ul>
        <li>Item pertama</li>
        <li>Item kedua</li>
      </ul>
      <table>
        <tr><th>Fitur</th><th>Status</th></tr>
        <tr><td>Word Editor</td><td>Aktif</td></tr>
      </table>
    `;

    const blob = await buildDocxBlobFromHtml(htmlInput, 'Rencana Proyek');
    expect(blob.size).toBeGreaterThan(1000);

    const buf = await blobToArrayBuffer(blob);
    const bytes = new Uint8Array(buf);
    // OOXML .docx starts with ZIP magic bytes "PK"
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const parsed = await parseDocxArrayBufferToHtml(buf);
    expect(parsed.html).toContain('Rencana Proyek DropRoom');
    expect(parsed.html).toContain('tebal');
    expect(parsed.html).toContain('Item pertama');
    expect(parsed.html).toContain('Word Editor');
  });

  it('creates an initial starter .docx document with title heading', async () => {
    const blob = await createEmptyDocxBlob('Notulen Rapat.docx');
    const parsed = await parseDocxArrayBufferToHtml(await blobToArrayBuffer(blob));
    expect(parsed.html).toContain('Notulen Rapat');
  });
});
