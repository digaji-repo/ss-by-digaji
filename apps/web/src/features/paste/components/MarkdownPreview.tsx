import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div className="p-4 min-h-[320px] max-h-[480px] overflow-y-auto text-[13.5px] leading-relaxed text-[var(--color-text-primary)] space-y-3 [&_h1]:text-[20px] [&_h1]:font-bold [&_h2]:text-[17px] [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-[5px] [&_code]:bg-[var(--color-surface-muted)] [&_pre]:p-3 [&_pre]:rounded-[10px] [&_pre]:bg-[var(--color-surface-muted)] [&_pre]:overflow-x-auto [&_a]:text-[var(--color-primary)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-primary)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-secondary)]">
      {content.trim() ? (
        <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
      ) : (
        <p className="text-[var(--color-text-secondary)] italic">Tidak ada konten Markdown.</p>
      )}
    </div>
  );
}
