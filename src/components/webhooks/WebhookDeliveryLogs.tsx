import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, ChevronRight, RefreshCw, Copy } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toast } from 'sonner';
import { Webhook, WebhookDelivery, WEBHOOK_EVENTS } from '@/hooks/useWebhooks';
import { WebhookPayloadViewer } from './WebhookPayloadViewer';

interface WebhookDeliveryLogsProps {
  webhooks: Webhook[];
  onFetchDeliveries: (
    webhookId: string,
    options?: { limit?: number; offset?: number; status?: 'success' | 'failed' | 'all' }
  ) => Promise<WebhookDelivery[]>;
}

export function WebhookDeliveryLogs({ webhooks, onFetchDeliveries }: WebhookDeliveryLogsProps) {
  const [selectedWebhookId, setSelectedWebhookId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedWebhookId) {
      loadDeliveries();
    }
  }, [selectedWebhookId, statusFilter]);

  const loadDeliveries = async () => {
    if (!selectedWebhookId) return;
    
    setLoading(true);
    const data = await onFetchDeliveries(selectedWebhookId, { 
      limit: 50, 
      status: statusFilter 
    });
    setDeliveries(data);
    setLoading(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyPayload = (payload: Record<string, unknown>) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success('Đã copy payload!');
  };

  const getStatusBadge = (status: number | null) => {
    if (!status) {
      return <Badge variant="outline">Pending</Badge>;
    }
    if (status >= 200 && status < 300) {
      return <Badge className="bg-green-500">{status}</Badge>;
    }
    if (status >= 400 && status < 500) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600">{status}</Badge>;
    }
    if (status >= 500) {
      return <Badge variant="destructive">{status}</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const getEventLabel = (eventId: string) => {
    const event = WEBHOOK_EVENTS.find(e => e.id === eventId);
    return event?.label || eventId;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📜 Delivery Logs
        </CardTitle>
        <CardDescription>
          Xem lịch sử delivery và payload chi tiết
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Select value={selectedWebhookId} onValueChange={setSelectedWebhookId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn webhook..." />
              </SelectTrigger>
              <SelectContent>
                {webhooks.map((webhook) => (
                  <SelectItem key={webhook.id} value={webhook.id}>
                    <span className="truncate">{webhook.url}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[150px]">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="success">✓ Success</SelectItem>
                <SelectItem value="failed">✗ Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={loadDeliveries}
            disabled={loading || !selectedWebhookId}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Deliveries List */}
        {!selectedWebhookId ? (
          <div className="text-center py-8 text-muted-foreground">
            Chọn webhook để xem delivery logs
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Chưa có delivery nào
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {deliveries.map((delivery) => (
                <Collapsible
                  key={delivery.id}
                  open={expandedIds.has(delivery.id)}
                  onOpenChange={() => toggleExpand(delivery.id)}
                >
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedIds.has(delivery.id) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          
                          <Badge variant="outline" className="text-xs">
                            {getEventLabel(delivery.event)}
                          </Badge>

                          {getStatusBadge(delivery.response_status)}

                          {delivery.attempt_count && delivery.attempt_count > 1 && (
                            <span className="text-xs text-muted-foreground">
                              ({delivery.attempt_count} attempts)
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {delivery.created_at && (
                            <span title={format(new Date(delivery.created_at), 'PPpp', { locale: vi })}>
                              {formatDistanceToNow(new Date(delivery.created_at), { 
                                addSuffix: true, 
                                locale: vi 
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-3 border-t pt-3">
                        {/* Error Message */}
                        {delivery.error_message && (
                          <div className="p-2 bg-destructive/10 rounded text-sm text-destructive">
                            <strong>Error:</strong> {delivery.error_message}
                          </div>
                        )}

                        {/* Payload */}
                        {delivery.payload && (
                          <div className="relative">
                            <WebhookPayloadViewer
                              payload={delivery.payload}
                              title="Payload"
                              maxHeight="200px"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-10"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyPayload(delivery.payload!);
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}

                        {/* Response Body */}
                        {delivery.response_body && (
                          <WebhookPayloadViewer
                            payload={(() => {
                              try {
                                return JSON.parse(delivery.response_body);
                              } catch {
                                return delivery.response_body;
                              }
                            })()}
                            title="Response"
                            maxHeight="150px"
                            collapsible
                            defaultCollapsed
                          />
                        )}

                        {/* Delivered At */}
                        {delivery.delivered_at && (
                          <p className="text-xs text-muted-foreground">
                            Delivered: {format(new Date(delivery.delivered_at), 'PPpp', { locale: vi })}
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
