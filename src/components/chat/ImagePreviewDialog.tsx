import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, Send, Loader2 } from 'lucide-react';

interface ImagePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  onSend: (caption: string) => void;
  uploading: boolean;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function ImagePreviewDialog({
  open,
  onClose,
  file,
  onSend,
  uploading,
}: ImagePreviewDialogProps) {
  const [caption, setCaption] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  useEffect(() => {
    if (!open) {
      setCaption('');
    }
  }, [open]);

  const handleSend = () => {
    onSend(caption.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !uploading) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !uploading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Gửi hình ảnh
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-8 w-8"
              onClick={onClose}
              disabled={uploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Preview */}
          <div className="relative rounded-xl overflow-hidden bg-muted flex items-center justify-center max-h-[300px]">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full max-h-[300px] object-contain"
              />
            )}
          </div>

          {/* File Info */}
          <p className="text-sm text-muted-foreground text-center">
            {file.name} • {formatFileSize(file.size)}
          </p>

          {/* Caption Input */}
          <Textarea
            placeholder="Thêm caption (tùy chọn)..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="resize-none rounded-xl"
            disabled={uploading}
          />

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={uploading}
              className="rounded-xl"
            >
              Hủy
            </Button>
            <Button
              onClick={handleSend}
              disabled={uploading}
              className="rounded-xl gradient-primary"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Gửi ảnh
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
