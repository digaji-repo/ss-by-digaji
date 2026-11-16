import { describe, expect, it } from 'vitest';
import { formatBytes } from '@/utils/format-size';
import { formatCountdown } from '@/utils/format-date';
import {
  DURATION_PRESETS,
  getExtensionForLanguage,
  getMonacoLanguageForFile,
  isEditableTextFile,
  isPreviewableFile,
  isValidRoomCode,
  normalizeRoomCode,
} from '@/utils/validators';

describe('validators and formatters', () => {
  it('normalizes and validates 3-char room codes', () => {
    expect(normalizeRoomCode(' q1w-9 ')).toBe('Q1W');
    expect(isValidRoomCode('abc')).toBe(true);
    expect(isValidRoomCode('A9Z')).toBe(true);
    expect(isValidRoomCode('AB')).toBe(false);
    expect(isValidRoomCode('AB$')).toBe(false);
  });

  it('matches PRD duration presets up to 7 days', () => {
    expect(DURATION_PRESETS.minutes).toEqual([5, 10, 15, 30, 45]);
    expect(DURATION_PRESETS.hours).toEqual([1, 2, 3, 6, 12, 24]);
    expect(DURATION_PRESETS.days).toEqual([1, 2, 3, 5, 7]);
  });

  it('formats byte sizes cleanly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });

  it('computes countdown states accurately', () => {
    const past = new Date(Date.now() - 5000).toISOString();
    expect(formatCountdown(past).isExpired).toBe(true);

    const soon = new Date(Date.now() + 90_000).toISOString();
    const soonState = formatCountdown(soon);
    expect(soonState.isExpired).toBe(false);
    expect(soonState.isWarning).toBe(true);
  });

  it('resolves language extensions and previewable mime types', () => {
    expect(getExtensionForLanguage('typescript')).toBe('ts');
    expect(getExtensionForLanguage('unknown')).toBe('txt');
    expect(isPreviewableFile('image/png')).toBe(true);
    expect(isPreviewableFile('application/pdf')).toBe(true);
    expect(isPreviewableFile('application/zip')).toBe(false);
    expect(isPreviewableFile('application/octet-stream', 'main.go')).toBe(true);
  });

  it('detects editable text/code files and maps Monaco languages accurately', () => {
    expect(isEditableTextFile('notes.md', 'text/markdown')).toBe(true);
    expect(isEditableTextFile('index.ts', 'video/mp2t')).toBe(true);
    expect(isEditableTextFile('photo.png', 'image/png')).toBe(false);

    expect(getMonacoLanguageForFile('notes.md', 'text/markdown')).toBe('markdown');
    expect(getMonacoLanguageForFile('app.ts', 'video/mp2t')).toBe('typescript');
    expect(getMonacoLanguageForFile('server.go', 'application/octet-stream')).toBe('go');
    expect(getMonacoLanguageForFile('README.txt', 'text/plain')).toBe('plaintext');
  });
});
