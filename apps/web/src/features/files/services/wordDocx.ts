import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type FileChild,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import mammoth from 'mammoth';

export interface DocxImportResult {
  html: string;
  warnings: string[];
}

interface InlineStyleState {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  highlightFill?: string;
  sizeHalfPt?: number;
}

const BULLET_REF = 'droproom-bullet-list';
const NUMBER_REF = 'droproom-number-list';

export async function parseDocxArrayBufferToHtml(
  arrayBuffer: ArrayBuffer
): Promise<DocxImportResult> {
  const input =
    typeof Buffer !== 'undefined'
      ? ({ arrayBuffer, buffer: Buffer.from(arrayBuffer) } as unknown as {
          arrayBuffer: ArrayBuffer;
        })
      : { arrayBuffer };
  const result = await mammoth.convertToHtml(input);
  const cleaned = result.value.trim();
  return {
    html: cleaned.length > 0 ? cleaned : '<p></p>',
    warnings: result.messages.map((m) => m.message),
  };
}

export async function createEmptyDocxBlob(title: string): Promise<Blob> {
  const cleanTitle = title.replace(/\.docx$/i, '').trim() || 'Dokumen Baru';
  return buildDocxBlobFromHtml(`<h1>${escapeHtml(cleanTitle)}</h1><p></p>`, cleanTitle);
}

export async function buildDocxBlobFromHtml(html: string, title?: string): Promise<Blob> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html || '<p></p>', 'text/html');
  const children: FileChild[] = [];

  for (const node of Array.from(parsed.body.childNodes)) {
    appendBlockNode(node, children);
  }

  if (children.length === 0) {
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({
    title: title || 'DropRoom Document',
    creator: 'DropRoom Word Editor',
    numbering: {
      config: [
        {
          reference: BULLET_REF,
          levels: Array.from({ length: 5 }, (_, level) => ({
            level,
            format: LevelFormat.BULLET,
            text: level % 2 === 0 ? '\u2022' : '\u25E6',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 420 * (level + 1), hanging: 240 },
              },
            },
          })),
        },
        {
          reference: NUMBER_REF,
          levels: Array.from({ length: 5 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 420 * (level + 1), hanging: 240 },
              },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134,
              right: 1134,
              bottom: 1134,
              left: 1134,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

function appendBlockNode(node: Node, out: FileChild[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    if (text) {
      out.push(new Paragraph({ children: [new TextRun({ text })] }));
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  switch (tag) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4': {
      const headingMap = {
        H1: HeadingLevel.HEADING_1,
        H2: HeadingLevel.HEADING_2,
        H3: HeadingLevel.HEADING_3,
        H4: HeadingLevel.HEADING_4,
      } as const;
      out.push(
        new Paragraph({
          heading: headingMap[tag],
          alignment: parseAlignment(el),
          spacing: { before: 180, after: 100 },
          children: collectInlineChildren(el, {}),
        })
      );
      return;
    }
    case 'P': {
      const inline = collectInlineChildren(el, {});
      out.push(
        new Paragraph({
          alignment: parseAlignment(el),
          spacing: { after: 120, line: 276 },
          children: inline.length > 0 ? inline : [new TextRun({ text: '' })],
        })
      );
      return;
    }
    case 'UL':
    case 'OL': {
      appendListElement(el, tag === 'OL' ? NUMBER_REF : BULLET_REF, 0, out);
      return;
    }
    case 'BLOCKQUOTE': {
      const runs = collectInlineChildren(el, { italics: true, color: '475569' });
      out.push(
        new Paragraph({
          indent: { left: 420 },
          spacing: { before: 100, after: 120 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 18, color: '0A84FF', space: 10 },
          },
          children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
        })
      );
      return;
    }
    case 'PRE': {
      const lines = (el.textContent ?? '').split(/\r?\n/);
      for (const line of lines) {
        out.push(
          new Paragraph({
            spacing: { after: 40 },
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' },
            children: [
              new TextRun({
                text: line || ' ',
                font: 'Consolas',
                size: 20,
              }),
            ],
          })
        );
      }
      return;
    }
    case 'HR': {
      out.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1', space: 4 },
          },
          spacing: { before: 120, after: 120 },
        })
      );
      return;
    }
    case 'TABLE': {
      const table = buildDocxTable(el);
      if (table) out.push(table);
      return;
    }
    case 'IMG': {
      const imgRun = buildImageRun(el);
      if (imgRun) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 120 },
            children: [imgRun],
          })
        );
      }
      return;
    }
    default: {
      for (const child of Array.from(el.childNodes)) {
        appendBlockNode(child, out);
      }
    }
  }
}

function appendListElement(
  listEl: HTMLElement,
  reference: string,
  level: number,
  out: FileChild[]
): void {
  const clampedLevel = Math.min(level, 4);
  for (const child of Array.from(listEl.children)) {
    if (child.tagName.toUpperCase() !== 'LI') continue;
    const li = child as HTMLElement;
    const nestedLists: HTMLElement[] = [];
    const inlineContainer: Node[] = [];

    for (const sub of Array.from(li.childNodes)) {
      if (sub.nodeType === Node.ELEMENT_NODE) {
        const subTag = (sub as HTMLElement).tagName.toUpperCase();
        if (subTag === 'UL' || subTag === 'OL') {
          nestedLists.push(sub as HTMLElement);
          continue;
        }
      }
      inlineContainer.push(sub);
    }

    const runs: ParagraphChild[] = [];
    for (const inlineNode of inlineContainer) {
      collectInlineFromNode(inlineNode, {}, runs);
    }

    out.push(
      new Paragraph({
        numbering: { reference, level: clampedLevel },
        spacing: { after: 60 },
        children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
      })
    );

    for (const nested of nestedLists) {
      const nestedRef = nested.tagName.toUpperCase() === 'OL' ? NUMBER_REF : BULLET_REF;
      appendListElement(nested, nestedRef, level + 1, out);
    }
  }
}

function buildDocxTable(tableEl: HTMLElement): Table | null {
  const rowEls = Array.from(tableEl.querySelectorAll('tr'));
  if (rowEls.length === 0) return null;

  const rows = rowEls.map((tr) => {
    const cellEls = Array.from(tr.children).filter((c) => {
      const t = c.tagName.toUpperCase();
      return t === 'TD' || t === 'TH';
    }) as HTMLElement[];

    const cells = cellEls.map((cell) => {
      const isHeader = cell.tagName.toUpperCase() === 'TH';
      const cellParagraphs: Paragraph[] = [];
      for (const child of Array.from(cell.childNodes)) {
        const temp: FileChild[] = [];
        appendBlockNode(child, temp);
        for (const item of temp) {
          if (item instanceof Paragraph) {
            cellParagraphs.push(item);
          }
        }
      }
      if (cellParagraphs.length === 0) {
        cellParagraphs.push(
          new Paragraph({
            children: collectInlineChildren(cell, isHeader ? { bold: true } : {}),
          })
        );
      }
      return new TableCell({
        shading: isHeader
          ? { type: ShadingType.CLEAR, fill: 'EFF6FF', color: 'auto' }
          : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: cellParagraphs,
      });
    });

    return new TableRow({
      tableHeader: cellEls.some((c) => c.tagName.toUpperCase() === 'TH'),
      children:
        cells.length > 0
          ? cells
          : [new TableCell({ children: [new Paragraph({ text: '' })] })],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
    },
    rows,
  });
}

function collectInlineChildren(el: HTMLElement, state: InlineStyleState): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const child of Array.from(el.childNodes)) {
    collectInlineFromNode(child, state, out);
  }
  return out;
}

function collectInlineFromNode(
  node: Node,
  state: InlineStyleState,
  out: ParagraphChild[]
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (!text) return;
    out.push(new TextRun(buildRunOptions(text, state)));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (tag === 'BR') {
    out.push(new TextRun({ break: 1 }));
    return;
  }

  if (tag === 'IMG') {
    const imgRun = buildImageRun(el);
    if (imgRun) out.push(imgRun);
    return;
  }

  const nextState: InlineStyleState = { ...state };
  if (tag === 'STRONG' || tag === 'B') nextState.bold = true;
  if (tag === 'EM' || tag === 'I') nextState.italics = true;
  if (tag === 'U') nextState.underline = true;
  if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') nextState.strike = true;
  if (tag === 'CODE') nextState.code = true;
  if (tag === 'MARK') {
    nextState.highlightFill = cssColorToHex(el.style.backgroundColor) ?? 'FEF08A';
  }

  const inlineColor = cssColorToHex(el.style.color);
  if (inlineColor) nextState.color = inlineColor;

  const inlineBg = cssColorToHex(el.style.backgroundColor);
  if (inlineBg) nextState.highlightFill = inlineBg;

  const fontSizePx = parseFloat(el.style.fontSize);
  if (!Number.isNaN(fontSizePx) && fontSizePx > 0) {
    nextState.sizeHalfPt = Math.round(fontSizePx * 1.5);
  }

  if (tag === 'A') {
    const href = el.getAttribute('href')?.trim() ?? '';
    const linkRuns: TextRun[] = [];
    const childRuns = collectInlineChildren(el, {
      ...nextState,
      underline: true,
      color: nextState.color ?? '0A84FF',
    });
    for (const child of childRuns) {
      if (child instanceof TextRun) linkRuns.push(child);
    }
    if (href && /^https?:\/\//i.test(href)) {
      out.push(
        new ExternalHyperlink({
          link: href,
          children:
            linkRuns.length > 0
              ? linkRuns
              : [new TextRun({ text: href, style: 'Hyperlink' })],
        })
      );
      return;
    }
    for (const run of childRuns) out.push(run);
    return;
  }

  for (const child of Array.from(el.childNodes)) {
    collectInlineFromNode(child, nextState, out);
  }
}

function buildRunOptions(text: string, state: InlineStyleState): IRunOptions {
  return {
    text,
    bold: state.bold,
    italics: state.italics,
    strike: state.strike,
    underline: state.underline ? { type: UnderlineType.SINGLE } : undefined,
    font: state.code ? 'Consolas' : undefined,
    color: state.color,
    size: state.sizeHalfPt ?? 22,
    shading: state.highlightFill
      ? { type: ShadingType.CLEAR, fill: state.highlightFill, color: 'auto' }
      : state.code
        ? { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' }
        : undefined,
  };
}

function buildImageRun(img: HTMLElement): ImageRun | null {
  const src = img.getAttribute('src') ?? '';
  const match = src.match(/^data:image\/(png|jpeg|jpg|gif|bmp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const rawFormat = match[1].toLowerCase();
  const type: 'png' | 'jpg' | 'gif' | 'bmp' = rawFormat === 'jpeg' ? 'jpg' : (rawFormat as 'png' | 'jpg' | 'gif' | 'bmp');
  const bytes = decodeBase64(match[2].replace(/\s+/g, ''));

  const attrWidth = Number(img.getAttribute('width')) || 440;
  const attrHeight = Number(img.getAttribute('height')) || 280;
  const scale = attrWidth > 540 ? 540 / attrWidth : 1;

  return new ImageRun({
    type,
    data: bytes,
    transformation: {
      width: Math.max(40, Math.round(attrWidth * scale)),
      height: Math.max(40, Math.round(attrHeight * scale)),
    },
  });
}

function decodeBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function parseAlignment(el: HTMLElement): IParagraphOptions['alignment'] {
  const raw = (el.style.textAlign || el.getAttribute('align') || '').toLowerCase();
  switch (raw) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
    case 'end':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    default:
      return undefined;
  }
}

function cssColorToHex(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'inherit') return undefined;

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.slice(1).toUpperCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed.split('');
    if (r && g && b) {
      return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
  }
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch?.[1] && rgbMatch[2] && rgbMatch[3]) {
    const toHex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    return `${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toUpperCase();
  }
  return undefined;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
