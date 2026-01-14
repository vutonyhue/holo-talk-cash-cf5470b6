import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { Webhook, WEBHOOK_EVENTS } from '@/hooks/useWebhooks';

interface WebhookEditDialogProps {
  webhook: Webhook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: { url?: string; events?: string[]; is_active?: boolean }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onRotateSecret?: (id: string) => Promise<string | null>;
}

export function WebhookEditDialog({
  webhook,
  open,
  onOpenChange,
  onSave,
  onDelete,
  onRotateSecret,
}: WebhookEditDialogProps) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  useEffect(() => {
    if (webhook) {
      setUrl(webhook.url);
      setEvents(webhook.events || []);
      setIsActive(webhook.is_active ?? true);
      setNewSecret(null);
    }
  }, [webhook]);

  const handleSave = async () => {
    if (!webhook) return;
    
    setSaving(true);
    const success = await onSave(webhook.id, {
      url,
      events,
      is_active: isActive,
    });
    setSaving(false);
    
    if (success) {
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    if (!webhook) return;
    
    setDeleting(true);
    const success = await onDelete(webhook.id);
    setDeleting(false);
    
    if (success) {
      onOpenChange(false);
    }
  };

  const handleRotateSecret = async () => {
    if (!webhook || !onRotateSecret) return;
    
    setRotatingSecret(true);
    const secret = await onRotateSecret(webhook.id);
    setRotatingSecret(false);
    
    if (secret) {
      setNewSecret(secret);
    }
  };

  const toggleEvent = (eventId: string, checked: boolean) => {
    setEvents(prev => 
      checked 
        ? [...prev, eventId] 
        : prev.filter(e => e !== eventId)
    );
  };

  if (!webhook) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Webhook</DialogTitle>
          <DialogDescription>
            Chỉnh sửa cấu hình webhook của bạn
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">Webhook URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
            />
          </div>

          {/* Events */}
          <div className="space-y-2">
            <Label>Events</Label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <div key={event.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`edit-${event.id}`}
                    checked={events.includes(event.id)}
                    onCheckedChange={(checked) => toggleEvent(event.id, !!checked)}
                  />
                  <label
                    htmlFor={`edit-${event.id}`}
                    className="text-sm cursor-pointer"
                  >
                    {event.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">
                Webhook sẽ nhận events khi active
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          {/* Rotate Secret */}
          {onRotateSecret && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Webhook Secret</Label>
                  <p className="text-xs text-muted-foreground">
                    Rotate secret để tạo key mới
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={rotatingSecret}>
                      {rotatingSecret ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Rotate
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rotate Webhook Secret?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Secret cũ sẽ không còn hoạt động. Bạn cần cập nhật secret mới trong server của mình.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Hủy</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRotateSecret}>
                        Rotate Secret
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              
              {newSecret && (
                <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-700 dark:text-green-300 mb-1">
                    🔑 Secret mới (lưu ngay, sẽ không hiển thị lại):
                  </p>
                  <code className="text-xs break-all">{newSecret}</code>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting}>
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Xóa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xóa webhook?</AlertDialogTitle>
                <AlertDialogDescription>
                  Webhook sẽ bị xóa vĩnh viễn và không thể khôi phục.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                  Xóa
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={saving || events.length === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Lưu
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
