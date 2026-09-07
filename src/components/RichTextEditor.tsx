import { useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Heading2, Quote, Eye, PencilLine } from 'lucide-react';
import { cn } from '../lib/utils';
import RichText from './RichText';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
}

export default function RichTextEditor({ value, onChange, placeholder, minRows = 4 }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPreview, setIsPreview] = useState(false);

  const wrapSelection = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value: text } = textarea;
    const selected = text.substring(selectionStart, selectionEnd) || 'texto';
    const next = text.substring(0, selectionStart) + before + selected + after + text.substring(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart + before.length, selectionStart + before.length + selected.length);
    });
  };

  const prefixLines = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value: text } = textarea;
    const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
    const selected = text.substring(lineStart, selectionEnd);
    const prefixed = selected
      .split('\n')
      .map(line => (line.startsWith(prefix.trim()) ? line.replace(prefix.trim(), '') : `${prefix}${line}`))
      .join('\n');
    const next = text.substring(0, lineStart) + prefixed + text.substring(selectionEnd);
    onChange(next);
  };

  const toolbar = [
    { icon: Bold, title: 'Negrita', action: () => wrapSelection('**', '**') },
    { icon: Italic, title: 'Cursiva', action: () => wrapSelection('*', '*') },
    { icon: Heading2, title: 'Subtítulo', action: () => prefixLines('## ') },
    { icon: List, title: 'Lista', action: () => prefixLines('- ') },
    { icon: ListOrdered, title: 'Lista numerada', action: () => prefixLines('1. ') },
    { icon: Quote, title: 'Cita', action: () => prefixLines('> ') },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] focus-within:border-[#2D3436]">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#E4E4E2] bg-white/60 px-2 py-1.5">
        {toolbar.map(({ icon: Icon, title, action }) => (
          <button
            key={title}
            type="button"
            title={title}
            onMouseDown={(e) => {
              e.preventDefault();
              action();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#636E72] hover:bg-[#F4F4F2] hover:text-[#2D3436]"
          >
            <Icon size={14} />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsPreview(false)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-bold uppercase tracking-widest transition-all",
              !isPreview ? "bg-[#2D3436] text-white" : "text-[#636E72] hover:bg-[#F4F4F2]"
            )}
          >
            <PencilLine size={12} />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setIsPreview(true)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-lg px-2 text-[10px] font-bold uppercase tracking-widest transition-all",
              isPreview ? "bg-[#2D3436] text-white" : "text-[#636E72] hover:bg-[#F4F4F2]"
            )}
          >
            <Eye size={12} />
            Vista
          </button>
        </div>
      </div>
      {isPreview ? (
        <div className="rich-text max-h-80 min-h-24 overflow-y-auto bg-white px-4 py-3 text-sm">
          {value ? <RichText>{value}</RichText> : <span className="text-[#B2BEC3]">Sin contenido.</span>}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={minRows}
          className="w-full resize-y bg-white px-4 py-3 text-sm outline-none"
        />
      )}
    </div>
  );
}