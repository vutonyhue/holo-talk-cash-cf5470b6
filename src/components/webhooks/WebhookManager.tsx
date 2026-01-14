import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Eye, EyeOff, Copy, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Webhook, WEBHOOK_EVENTS } from '@/hooks/useWebhooks';
import { WebhookEditDialog } from './WebhookEditDialog';

interface WebhookManagerProps {
  webhooks: Webhook[];
  loading: boolean;
  onCreateWebhook: (url: string, events: string[]) => Promise<Webhook | null>;
  onUpdateWebhook: (id: string, updates: { url?: string; events?: string[]; is_active?: boolean }) => Promise<boolean>;
  onDeleteWebhook: (id: string) => Promise<boolean>;
  onRotateSecret?: (id: string) => Promise<string | null>;
}

export function WebhookManager({
  webhooks,
  loading,
  onCreateWebhook,
  onUpdateWebhook,
  onDeleteWebhook,
  onRotateSecret,
}: WebhookManagerProps) {
  const [newUrl, setNewUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['message.created']);
  const [creating, setCreating] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);

  const handleCreate = async () => {
    if (!newUrl.trim()) {
      toast.error('URL là bắt buộc');
      return;
    }

    if (!newUrl.startsWith('https://')) {
      toast.error('URL phải sử dụng HTTPS');
      return;
    }

    if (selectedEvents.length === 0) {
      toast.error('Chọn ít nhất một event');
      return;
    }

    setCreating(true);
    const webhook = await onCreateWebhook(newUrl, selectedEvents);
    setCreating(false);

    if (webhook?.secret) {
      setCreatedSecret(webhook.secret);
      setNewUrl('');
      setSelectedEvents(['message.created']);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Đã copy!');
  };

  const toggleEvent = (eventId: string, checked: boolean) => {
    setSelectedEvents(prev =>
      checked
        ? [...prev, eventId]
        : prev.filter(e => e !== eventId)
    );
  };

  const getStatusIcon = (webhook: Webhook) => {
    if (!webhook.is_active) {
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
    if ((webhook.failure_count || 0) > 0) {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  const getStatusColor = (webhook: Webhook): "default" | "secondary" | "destructive" | "outline" => {
    if (!webhook.is_active) return 'secondary';
    if ((webhook.failure_count || 0) > 0) return 'destructive';
    return 'default';
  };

  return (
    <>
      {/* Created Secret Alert */}
      {createdSecret && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950 mb-4">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              🔑 Webhook Secret
            </CardTitle>
            <CardDescription>
              Lưu secret này ngay. Bạn sẽ không thể xem lại sau khi đóng.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={createdSecret}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(createdSecret)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => setCreatedSecret(null)}
            >
              Đã lưu, đóng
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Webhook Form */}
      <Card>
        <CardHeader>
          <CardTitle>Tạo Webhook mới</CardTitle>
          <CardDescription>
            Nhận thông báo real-time khi có events trong hệ thống
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
            />
            <p className="text-xs text-muted-foreground">
              URL phải sử dụng HTTPS
            </p>
          </div>

          <div className="space-y-2">
            <Label>Events</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <div key={event.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={event.id}
                    checked={selectedEvents.includes(event.id)}
                    onCheckedChange={(checked) => toggleEvent(event.id, !!checked)}
                  />
                  <label
                    htmlFor={event.id}
                    className="text-sm cursor-pointer"
                    title={event.description}
                  >
                    {event.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Tạo Webhook
          </Button>
        </CardContent>
      </Card>

      {/* Webhooks List */}
      <Card>
        <CardHeader>
          <CardTitle>Webhooks của bạn ({webhooks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : webhooks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Chưa có webhook nào. Tạo webhook đầu tiên ở trên!
            </p>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(webhook)}
                          <code className="text-sm font-medium truncate block">
                            {webhook.url}
                          </code>
                        </div>
                        
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(webhook.events || []).map((event) => (
                            <Badge key={event} variant="outline" className="text-xs">
                              {event}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {webhook.last_triggered_at && (
                            <span>
                              Triggered: {formatDistanceToNow(new Date(webhook.last_triggered_at), { 
                                addSuffix: true, 
                                locale: vi 
                              })}
                            </span>
                          )}
                          {(webhook.failure_count || 0) > 0 && (
                            <span className="text-destructive">
                              {webhook.failure_count} lỗi
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusColor(webhook)}>
                          {webhook.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingWebhook(webhook)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <WebhookEditDialog
        webhook={editingWebhook}
        open={!!editingWebhook}
        onOpenChange={(open) => !open && setEditingWebhook(null)}
        onSave={onUpdateWebhook}
        onDelete={onDeleteWebhook}
        onRotateSecret={onRotateSecret}
      />
    </>
  );
}
