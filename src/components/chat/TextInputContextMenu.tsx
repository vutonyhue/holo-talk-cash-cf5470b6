import React, { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Undo,
  Redo,
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Quote,
  Code,
  EyeOff,
  Link,
  RemoveFormatting,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

interface TextInputContextMenuProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  className?: string;
}

export default function TextInputContextMenu({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
}: TextInputContextMenuProps) {
  const handleUndo = () => {
    document.execCommand('undo');
  };

  const handleRedo = () => {
    document.execCommand('redo');
  };

  const handleCut = async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    if (selectedText) {
      await navigator.clipboard.writeText(selectedText);
      const newValue = value.slice(0, start) + value.slice(end);
      onChange(newValue);
      toast.success('Đã cắt văn bản');
    }
  };

  const handleCopy = async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    if (selectedText) {
      await navigator.clipboard.writeText(selectedText);
      toast.success('Đã sao chép văn bản');
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = value.slice(0, start) + text + value.slice(end);
      onChange(newValue);

      // Set cursor position after pasted text
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + text.length, start + text.length);
      }, 0);
    } catch (error) {
      toast.error('Không thể dán văn bản');
    }
  };

  const handleDelete = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const newValue = value.slice(0, start) + value.slice(end);
      onChange(newValue);
    }
  };

  const handleSelectAll = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.select();
  };

  const formatText = (type: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    const formats: Record<string, [string, string]> = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      underline: ['__', '__'],
      strikethrough: ['~~', '~~'],
      quote: ['> ', ''],
      code: ['`', '`'],
      spoiler: ['||', '||'],
    };

    const [prefix, suffix] = formats[type];
    const newText = value.slice(0, start) + prefix + selectedText + suffix + value.slice(end);
    onChange(newText);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 0);
  };

  const handleCreateLink = async () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    const url = prompt('Nhập URL:', 'https://');
    if (url) {
      const linkText = selectedText || 'link';
      const markdownLink = `[${linkText}](${url})`;
      const newValue = value.slice(0, start) + markdownLink + value.slice(end);
      onChange(newValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + markdownLink.length, start + markdownLink.length);
      }, 0);
    }
  };

  const handleClearFormatting = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    // Remove common markdown formatting
    const cleanText = selectedText
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/__/g, '')
      .replace(/~~/g, '')
      .replace(/\|\|/g, '')
      .replace(/`/g, '')
      .replace(/^> /gm, '');

    const newValue = value.slice(0, start) + cleanText + value.slice(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + cleanText.length);
    }, 0);
  };

  return (
    <ContextMenuContent className="w-56 bg-popover border border-border shadow-lg z-50">
      <ContextMenuItem onClick={handleUndo} className="cursor-pointer">
        <Undo className="mr-2 h-4 w-4" />
        Hoàn tác
        <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleRedo} className="cursor-pointer">
        <Redo className="mr-2 h-4 w-4" />
        Làm lại
        <ContextMenuShortcut>Ctrl+Y</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleCut} className="cursor-pointer">
        <Scissors className="mr-2 h-4 w-4" />
        Cắt
        <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCopy} className="cursor-pointer">
        <Copy className="mr-2 h-4 w-4" />
        Sao chép
        <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handlePaste} className="cursor-pointer">
        <ClipboardPaste className="mr-2 h-4 w-4" />
        Dán
        <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDelete} className="cursor-pointer">
        <Trash2 className="mr-2 h-4 w-4" />
        Xóa
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuSub>
        <ContextMenuSubTrigger className="cursor-pointer">
          <Type className="mr-2 h-4 w-4" />
          Định dạng
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48 bg-popover border border-border">
          <ContextMenuItem onClick={() => formatText('bold')} className="cursor-pointer">
            <Bold className="mr-2 h-4 w-4" />
            In đậm
            <ContextMenuShortcut>Ctrl+B</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => formatText('italic')} className="cursor-pointer">
            <Italic className="mr-2 h-4 w-4" />
            In nghiêng
            <ContextMenuShortcut>Ctrl+I</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => formatText('underline')} className="cursor-pointer">
            <Underline className="mr-2 h-4 w-4" />
            Gạch chân
            <ContextMenuShortcut>Ctrl+U</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => formatText('strikethrough')} className="cursor-pointer">
            <Strikethrough className="mr-2 h-4 w-4" />
            Gạch ngang
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => formatText('quote')} className="cursor-pointer">
            <Quote className="mr-2 h-4 w-4" />
            Trích dẫn
          </ContextMenuItem>
          <ContextMenuItem onClick={() => formatText('code')} className="cursor-pointer">
            <Code className="mr-2 h-4 w-4" />
            Monospace
          </ContextMenuItem>
          <ContextMenuItem onClick={() => formatText('spoiler')} className="cursor-pointer">
            <EyeOff className="mr-2 h-4 w-4" />
            Spoiler
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleCreateLink} className="cursor-pointer">
        <Link className="mr-2 h-4 w-4" />
        Tạo liên kết
        <ContextMenuShortcut>Ctrl+K</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleClearFormatting} className="cursor-pointer">
        <RemoveFormatting className="mr-2 h-4 w-4" />
        Xóa định dạng
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleSelectAll} className="cursor-pointer">
        <FileText className="mr-2 h-4 w-4" />
        Chọn tất cả
        <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
