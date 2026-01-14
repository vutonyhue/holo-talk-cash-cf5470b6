import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Key, Webhook, Code, BarChart3, Copy, Plus, Trash2, Eye, EyeOff, ExternalLink, Layout, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AVAILABLE_SCOPES = [
  { id: 'chat:read', label: 'Chat Read', description: 'Read conversations and messages' },
  { id: 'chat:write', label: 'Chat Write', description: 'Send messages, create conversations' },
  { id: 'users:read', label: 'Users Read', description: 'View user profiles' },
  { id: 'users:write', label: 'Users Write', description: 'Update profile' },
  { id: 'calls:read', label: 'Calls Read', description: 'View call history' },
  { id: 'calls:write', label: 'Calls Write', description: 'Initiate calls' },
  { id: 'crypto:read', label: 'Crypto Read', description: 'View transactions' },
  { id: 'crypto:write', label: 'Crypto Write', description: 'Make transfers' },
  { id: 'webhooks:read', label: 'Webhooks Read', description: 'View webhooks' },
  { id: 'webhooks:write', label: 'Webhooks Write', description: 'Manage webhooks' },
];

const WEBHOOK_EVENTS = [
  { id: 'message.created', label: 'Message Created' },
  { id: 'message.deleted', label: 'Message Deleted' },
  { id: 'call.started', label: 'Call Started' },
  { id: 'call.ended', label: 'Call Ended' },
  { id: 'crypto.transfer', label: 'Crypto Transfer' },
];

export default function DeveloperPortal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['chat:read', 'users:read']);
  const [allowedOrigins, setAllowedOrigins] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  
  // Widget embed state
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>("");
  const [widgetTheme, setWidgetTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [widgetPosition, setWidgetPosition] = useState<string>('bottom-right');
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
      fetchConversations();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const [keysRes, webhooksRes] = await Promise.all([
      supabase.from('api_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('webhooks').select('*').order('created_at', { ascending: false }),
    ]);
    setApiKeys(keysRes.data || []);
    setWebhooks(webhooksRes.data || []);
    setLoading(false);
  };

  const fetchConversations = async () => {
    const { data } = await supabase
      .from('conversation_members')
      .select('conversation:conversations(id, name, is_group)')
      .eq('user_id', user?.id);
    
    if (data) {
      const convos = data.map((d: any) => d.conversation).filter(Boolean);
      setConversations(convos);
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Tên API key là bắt buộc");
      return;
    }

    const origins = allowedOrigins.split(',').map(o => o.trim()).filter(Boolean);

    const { data, error } = await supabase.functions.invoke('api-keys', {
      method: 'POST',
      body: { 
        name: newKeyName, 
        scopes: selectedScopes,
        allowed_origins: origins,
      },
    });

    if (error || !data?.success) {
      toast.error("Lỗi tạo API key");
      return;
    }

    setCreatedKey(data.data.api_key);
    setNewKeyName("");
    setSelectedScopes(['chat:read', 'users:read']);
    setAllowedOrigins("");
    fetchData();
    toast.success("Tạo API key thành công! Lưu lại key ngay.");
  };

  const deleteApiKey = async (id: string) => {
    const { error } = await supabase.from('api_keys').delete().eq('id', id);
    if (!error) {
      fetchData();
      toast.success("Đã xóa API key");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Đã copy!");
  };

  const generateWidgetToken = async () => {
    if (!selectedConversation) {
      toast.error("Vui lòng chọn conversation");
      return;
    }

    // Find an API key with chat:read scope
    const apiKey = apiKeys.find(k => k.is_active && k.scopes?.includes('chat:read'));
    if (!apiKey) {
      toast.error("Bạn cần tạo API key với scope 'chat:read' trước");
      return;
    }

    setGeneratingToken(true);
    try {
      const { data, error } = await supabase.functions.invoke('widget-token', {
        body: {
          action: 'create',
          conversation_id: selectedConversation,
          scopes: ['chat:read', 'chat:write'],
        },
        headers: {
          'x-funchat-key-id': apiKey.id,
          'x-funchat-user-id': user?.id,
          'x-funchat-scopes': apiKey.scopes?.join(',') || '',
        },
      });

      if (error || !data?.token) {
        throw new Error(data?.error || 'Failed to generate token');
      }

      setWidgetToken(data.token);
      toast.success("Widget token đã được tạo!");
    } catch (err: any) {
      toast.error(err.message || "Lỗi tạo widget token");
    } finally {
      setGeneratingToken(false);
    }
  };

  const getEmbedCode = () => {
    if (!widgetToken) return '';
    
    const baseUrl = window.location.origin;
    return `<!-- FunChat Widget -->
<script src="${baseUrl}/widget.js"></script>
<script>
  FunChatWidget.init({
    token: '${widgetToken}',
    theme: '${widgetTheme}',
    position: '${widgetPosition}',
    buttonColor: '#7C3AED'
  });
</script>`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Vui lòng đăng nhập</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Developer Portal</h1>
      </header>

      <div className="container max-w-6xl mx-auto p-4">
        <Tabs defaultValue="api-keys" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="api-keys"><Key className="h-4 w-4 mr-2" />API Keys</TabsTrigger>
            <TabsTrigger value="widget"><Layout className="h-4 w-4 mr-2" />Widget</TabsTrigger>
            <TabsTrigger value="webhooks"><Webhook className="h-4 w-4 mr-2" />Webhooks</TabsTrigger>
            <TabsTrigger value="sdk"><Code className="h-4 w-4 mr-2" />SDK</TabsTrigger>
            <TabsTrigger value="usage"><BarChart3 className="h-4 w-4 mr-2" />Usage</TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-4">
            {createdKey && (
              <Card className="border-green-500 bg-green-50 dark:bg-green-950">
                <CardHeader>
                  <CardTitle className="text-green-700 dark:text-green-300">🔑 API Key Created!</CardTitle>
                  <CardDescription>Lưu key này ngay. Bạn sẽ không thể xem lại.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Input 
                      type={showKey ? "text" : "password"} 
                      value={createdKey} 
                      readOnly 
                      className="font-mono"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)}>
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(createdKey)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button variant="ghost" className="mt-2" onClick={() => setCreatedKey(null)}>
                    Đã lưu, đóng
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Tạo API Key mới</CardTitle>
                <CardDescription>API keys cho phép tích hợp FunChat vào ứng dụng của bạn</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tên</Label>
                  <Input 
                    value={newKeyName} 
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="Production API Key"
                  />
                </div>
                <div>
                  <Label>Scopes</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <div key={scope.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={scope.id}
                          checked={selectedScopes.includes(scope.id)}
                          onCheckedChange={(checked) => {
                            setSelectedScopes(prev => 
                              checked 
                                ? [...prev, scope.id]
                                : prev.filter(s => s !== scope.id)
                            );
                          }}
                        />
                        <label htmlFor={scope.id} className="text-sm cursor-pointer">
                          <span className="font-medium">{scope.label}</span>
                          <span className="text-muted-foreground ml-1">- {scope.description}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Allowed Origins (comma separated)</Label>
                  <Input 
                    value={allowedOrigins} 
                    onChange={(e) => setAllowedOrigins(e.target.value)}
                    placeholder="https://myapp.com, https://staging.myapp.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Để trống = cho phép tất cả origins</p>
                </div>
                <Button onClick={createApiKey}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tạo API Key
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Keys của bạn</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {apiKeys.map((key) => (
                    <div key={key.id} className="border rounded-lg p-4 mb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{key.name}</h4>
                          <code className="text-sm text-muted-foreground">{key.key_prefix}...</code>
                          {key.app_id && <Badge variant="outline" className="ml-2">{key.app_id}</Badge>}
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={key.is_active ? "default" : "secondary"}>
                            {key.is_active ? "Active" : "Inactive"}
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => deleteApiKey(key.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(key.scopes || []).map((scope: string) => (
                          <Badge key={scope} variant="secondary" className="text-xs">{scope}</Badge>
                        ))}
                      </div>
                      {key.allowed_origins?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Origins: {key.allowed_origins.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                  {apiKeys.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">Chưa có API key nào</p>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>Nhận thông báo real-time khi có events</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Webhooks được quản lý qua API. Sử dụng endpoint <code>/api-webhooks</code> để tạo và quản lý webhooks.
                </p>
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Available Events:</h4>
                  <div className="flex flex-wrap gap-2">
                    {WEBHOOK_EVENTS.map((event) => (
                      <Badge key={event.id} variant="outline">{event.label}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SDK Tab */}
          <TabsContent value="sdk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>FunChat SDK</CardTitle>
                <CardDescription>Tích hợp FunChat vào ứng dụng của bạn</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-medium mb-2">Installation</h4>
                  <code className="block bg-background p-2 rounded">npm install funchat-sdk</code>
                </div>
                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-medium mb-2">Usage</h4>
                  <pre className="bg-background p-2 rounded text-sm overflow-x-auto">{`import { FunChat } from 'funchat-sdk';

const client = new FunChat({
  apiKey: 'fc_live_your_api_key',
  baseUrl: 'https://api.funchat.app' // Cloudflare Worker URL
});

// Chat
const conversations = await client.chat.list();
await client.chat.send(conversationId, { content: 'Hello!' });

// Users
const me = await client.users.me();

// Calls
await client.calls.initiate(conversationId, 'video');

// Crypto
await client.crypto.transfer({ to: userId, amount: 100, currency: 'CAMLY' });`}</pre>
                </div>
                <Button variant="outline" onClick={() => navigate('/api-docs')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Xem API Documentation
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Widget Embed Tab */}
          <TabsContent value="widget" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Widget Embed</CardTitle>
                <CardDescription>
                  Nhúng FunChat vào website bên ngoài với iframe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Configuration */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Chọn Conversation</Label>
                    <Select value={selectedConversation} onValueChange={setSelectedConversation}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn conversation..." />
                      </SelectTrigger>
                      <SelectContent>
                        {conversations.map((conv) => (
                          <SelectItem key={conv.id} value={conv.id}>
                            {conv.name || `Conversation ${conv.id.slice(0, 8)}`}
                            {conv.is_group && <Badge variant="secondary" className="ml-2">Group</Badge>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Theme</Label>
                    <Select value={widgetTheme} onValueChange={(v) => setWidgetTheme(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (theo system)</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Vị trí</Label>
                    <Select value={widgetPosition} onValueChange={setWidgetPosition}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Dưới phải</SelectItem>
                        <SelectItem value="bottom-left">Dưới trái</SelectItem>
                        <SelectItem value="top-right">Trên phải</SelectItem>
                        <SelectItem value="top-left">Trên trái</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={generateWidgetToken} disabled={generatingToken || !selectedConversation}>
                  {generatingToken ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Tạo Widget Token
                </Button>

                {/* Generated embed code */}
                {widgetToken && (
                  <div className="space-y-4">
                    <div className="bg-muted rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Widget Token</h4>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(widgetToken)}
                        >
                          <Copy className="h-4 w-4 mr-1" /> Copy
                        </Button>
                      </div>
                      <code className="text-sm break-all">{widgetToken}</code>
                      <p className="text-xs text-muted-foreground mt-2">
                        ⚠️ Token có hạn 1 giờ. Sử dụng server-side để tự động refresh.
                      </p>
                    </div>

                    <div className="bg-muted rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Embed Code</h4>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(getEmbedCode())}
                        >
                          <Copy className="h-4 w-4 mr-1" /> Copy
                        </Button>
                      </div>
                      <pre className="bg-background p-3 rounded text-sm overflow-x-auto whitespace-pre-wrap">
                        {getEmbedCode()}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Widget Documentation */}
            <Card>
              <CardHeader>
                <CardTitle>Widget SDK API</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-medium mb-2">Các phương thức</h4>
                  <pre className="bg-background p-2 rounded text-sm overflow-x-auto">{`// Mở widget
FunChatWidget.open();

// Đóng widget
FunChatWidget.close();

// Toggle widget
FunChatWidget.toggle();

// Đổi theme
FunChatWidget.setTheme('dark');

// Lắng nghe events
FunChatWidget.on('ready', () => console.log('Widget ready'));
FunChatWidget.on('message', (msg) => console.log('New message:', msg));
FunChatWidget.on('unread', ({ count }) => console.log('Unread:', count));

// Hủy widget
FunChatWidget.destroy();`}</pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Usage Tab */}
          <TabsContent value="usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Usage</CardTitle>
                <CardDescription>Thống kê sử dụng API</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Xem chi tiết usage trong trang <Button variant="link" className="p-0" onClick={() => navigate('/api-keys')}>API Keys</Button>
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
