export const DURATION_PRESETS = {
  minutes: [5, 10, 15, 30, 45],
  hours: [1, 2, 3, 6, 12, 24],
  days: [1, 2, 3, 5, 7],
} as const;

export const PASTE_LANGUAGES = [
  { id: 'plaintext', label: 'Plain Text', ext: 'txt' },
  { id: 'javascript', label: 'JavaScript', ext: 'js' },
  { id: 'typescript', label: 'TypeScript', ext: 'ts' },
  { id: 'python', label: 'Python', ext: 'py' },
  { id: 'go', label: 'Go', ext: 'go' },
  { id: 'json', label: 'JSON', ext: 'json' },
  { id: 'markdown', label: 'Markdown', ext: 'md' },
  { id: 'html', label: 'HTML', ext: 'html' },
  { id: 'css', label: 'CSS', ext: 'css' },
  { id: 'sql', label: 'SQL', ext: 'sql' },
  { id: 'shell', label: 'Bash / Shell', ext: 'sh' },
  { id: 'yaml', label: 'YAML', ext: 'yaml' },
  { id: 'xml', label: 'XML', ext: 'xml' },
  { id: 'rust', label: 'Rust', ext: 'rs' },
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'cpp', label: 'C++', ext: 'cpp' },
  { id: 'php', label: 'PHP', ext: 'php' },
  { id: 'ini', label: 'Config / Env', ext: 'env' },
] as const;

const EXT_TO_MONACO_LANG: Record<string, string> = {
  txt: 'plaintext',
  log: 'plaintext',
  csv: 'plaintext',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  jsonc: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  pyw: 'python',
  go: 'go',
  html: 'html',
  htm: 'html',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  rs: 'rust',
  java: 'java',
  c: 'cpp',
  h: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  php: 'php',
  rb: 'ruby',
  env: 'ini',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  toml: 'ini',
  gitignore: 'ini',
  dockerignore: 'ini',
  editorconfig: 'ini',
};

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

export function isValidRoomCode(raw: string): boolean {
  return /^[A-Z0-9]{3}$/.test(raw.trim().toUpperCase());
}

export function getExtensionForLanguage(langId: string): string {
  return PASTE_LANGUAGES.find((item) => item.id === langId)?.ext ?? 'txt';
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.trim().toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts.pop() ?? '';
}

export const WORD_DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function isWordDocumentFile(fileName: string, mimeType = ''): boolean {
  const ext = getFileExtension(fileName);
  if (ext === 'docx') {
    return true;
  }
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return base === WORD_DOCX_MIME;
}

export function isEditableTextFile(fileName: string, mimeType: string): boolean {
  const ext = getFileExtension(fileName);
  if (ext && Object.prototype.hasOwnProperty.call(EXT_TO_MONACO_LANG, ext)) {
    return true;
  }
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    base.startsWith('text/') ||
    base === 'application/json' ||
    base === 'application/xml' ||
    base === 'application/javascript'
  );
}

export function getMonacoLanguageForFile(fileName: string, mimeType: string): string {
  const ext = getFileExtension(fileName);
  if (ext && EXT_TO_MONACO_LANG[ext]) {
    return EXT_TO_MONACO_LANG[ext];
  }
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === 'application/json') return 'json';
  if (base === 'text/markdown') return 'markdown';
  if (base === 'text/html') return 'html';
  if (base === 'text/css') return 'css';
  if (base.includes('javascript')) return 'javascript';
  if (base.includes('typescript')) return 'typescript';
  if (base.includes('xml')) return 'xml';
  return 'plaintext';
}

export function isPreviewableFile(mimeType: string, fileName = ''): boolean {
  if (fileName && (isEditableTextFile(fileName, mimeType) || isWordDocumentFile(fileName, mimeType))) {
    return true;
  }
  if (isWordDocumentFile(fileName, mimeType)) {
    return true;
  }
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    base.startsWith('image/') ||
    base.startsWith('text/') ||
    base.startsWith('audio/') ||
    base.startsWith('video/') ||
    base === 'application/pdf' ||
    base === 'application/json' ||
    base === 'application/xml' ||
    base === 'application/javascript'
  );
}
