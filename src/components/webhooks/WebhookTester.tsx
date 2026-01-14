import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Webhook, TestResult, WEBHOOK_EVENTS, SAMPLE_PAYLOADS } from '@/hooks/useWebhooks';
import { WebhookPayloadViewer } from './WebhookPayloadViewer';

interface WebhookTesterProps {
  webhooks: Webhook[];
  onTest: (id: string, event?: string, payload?: Record<string, unknown>) => Promise<TestResult>;
  testLoading: boolean;
}

export function WebhookTester({ webhooks, onTest, testLoading }: WebhookTesterProps) {
  const [selectedWebhookId, setSelectedWebhookId] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('test');
  const [customPayload, setCustomPayload] = useState<string>('');
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const activeWebhooks = webhooks.filter(w => w.is_active);

  // Update sample payload when event changes
  useEffect(() => {
    const sample = SAMPLE_PAYLOADS[selectedEvent] || SAMPLE_PAYLOADS['test'];
    setCustomPayload(JSON.stringify(sample, null, 2));
    setPayloadError(null);
  }, [selectedEvent]);

  const validatePayload = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(customPayload);
      setPayloadError(null);
      return parsed;
    } catch (err: any) {
      setPayloadError(`JSON không hợp lệ: ${err.message}`);
      return null;
    }
  };

  const handleTest = async () => {
    if (!selectedWebhookId) return;

    const payload = validatePayload();
    if (!payload) return;

    const result = await onTest(selectedWebhookId, selectedEvent, payload);
    setTestResult(result);
  };

  const getStatusBadge = (status?: number) => {
    if (!status) return null;
    
    if (status >= 200 && status < 300) {
      return <Badge className="bg-green-500">✓ {status} OK</Badge>;
    }
    if (status >= 400 && status < 500) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600">{status} Client Error</Badge>;
    }
    if (status >= 500) {
      return <Badge variant="destructive">{status} Server Error</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🧪 Webhook Tester
        </CardTitle>
        <CardDescription>
          Test webhook với custom payload và xem response trực tiếp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeWebhooks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Chưa có webhook active. Tạo webhook ở trên để test.
          </div>
        ) : (
          <>
            {/* Webhook & Event Selection */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Chọn Webhook</Label>
                <Select value={selectedWebhookId} onValueChange={setSelectedWebhookId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn webhook..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWebhooks.map((webhook) => (
                      <SelectItem key={webhook.id} value={webhook.id}>
                        <span className="truncate">{webhook.url}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Event Type</Label>
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">
                      🧪 Test Event
                    </SelectItem>
                    {WEBHOOK_EVENTS.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom Payload Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Custom Payload (JSON)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const sample = SAMPLE_PAYLOADS[selectedEvent] || SAMPLE_PAYLOADS['test'];
                    setCustomPayload(JSON.stringify(sample, null, 2));
                    setPayloadError(null);
                  }}
                >
                  Reset to Sample
                </Button>
              </div>
              <Textarea
                value={customPayload}
                onChange={(e) => {
                  setCustomPayload(e.target.value);
                  setPayloadError(null);
                }}
                placeholder='{"key": "value"}'
                className="font-mono text-sm min-h-[150px]"
              />
              {payloadError && (
                <p className="text-sm text-destructive">{payloadError}</p>
              )}
            </div>

            {/* Send Button */}
            <Button
              onClick={handleTest}
              disabled={testLoading || !selectedWebhookId}
              className="w-full"
              size="lg"
            >
              {testLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Gửi Test Webhook
            </Button>

            {/* Test Result */}
            {testResult && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Response</h4>
                  <div className="flex items-center gap-2">
                    {testResult.sent ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Sent</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm">Failed</span>
                      </div>
                    )}
                    {testResult.duration_ms && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">{testResult.duration_ms}ms</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status */}
                {testResult.status && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    {getStatusBadge(testResult.status)}
                    {testResult.statusText && (
                      <span className="text-sm text-muted-foreground">
                        {testResult.statusText}
                      </span>
                    )}
                  </div>
                )}

                {/* Error */}
                {testResult.error && (
                  <div className="p-3 bg-destructive/10 rounded-lg text-destructive text-sm">
                    <strong>Error:</strong> {testResult.error}
                  </div>
                )}

                {/* Response Headers */}
                {testResult.headers && Object.keys(testResult.headers).length > 0 && (
                  <WebhookPayloadViewer
                    payload={testResult.headers}
                    title="Response Headers"
                    maxHeight="150px"
                    collapsible
                    defaultCollapsed
                  />
                )}

                {/* Response Body */}
                {testResult.body && (
                  <WebhookPayloadViewer
                    payload={(() => {
                      try {
                        return JSON.parse(testResult.body);
                      } catch {
                        return testResult.body;
                      }
                    })()}
                    title="Response Body"
                    maxHeight="200px"
                  />
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
