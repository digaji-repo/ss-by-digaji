import Editor from '@monaco-editor/react';
import { useUIStore } from '@/stores/ui.store';

interface MonacoCodeEditorProps {
  value: string;
  language: string;
  onChange: (nextValue: string) => void;
  readOnly?: boolean;
}

export default function MonacoCodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
}: MonacoCodeEditorProps) {
  const theme = useUIStore((s) => s.theme);

  return (
    <Editor
      height="420px"
      language={language}
      value={value}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      onChange={(next) => onChange(next ?? '')}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        tabSize: 2,
      }}
    />
  );
}
