import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { ResponseViewer } from "./ResponseViewer";
import { EndpointDetail, EndpointSchema } from "./EndpointDetail";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { API_BASE_URL } from "@/config/workerUrls";

const BASE_URL = API_BASE_URL;

// Full endpoint schemas with parameters
const endpointSchemas: EndpointSchema[] = [
  // Chat endpoints
  {
    method: "GET",
    path: "/api-chat/conversations",
    description: "List all conversations for the authenticated user",
    summary: "Retrieve a list of all conversations you're a member of, including group chats and direct messages.",
    category: "chat",
    auth_required: true,
    permissions: ["chat"],
    parameters: [
      { name: "limit", in: "query", type: "integer", required: false, description: "Maximum number of conversations to return", example: "20" },
      { name: "offset", in: "query", type: "integer", required: false, description: "Number of conversations to skip", example: "0" },
    ],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: [{ id: "uuid", name: "Chat Name", is_group: false, created_at: "2026-01-07T10:00:00Z" }], meta: { count: 1 } } },
      { status: 401, description: "Unauthorized", example: { success: false, error: { code: "UNAUTHORIZED", message: "Invalid API key" } } },
    ],
  },
  {
    method: "GET",
    path: "/api-chat/conversations/:id",
    description: "Get a specific conversation by ID",
    summary: "Retrieve detailed information about a specific conversation, including members.",
    category: "chat",
    auth_required: true,
    permissions: ["chat"],
    parameters: [
      { name: "id", in: "path", type: "uuid", required: true, description: "Conversation ID", example: "123e4567-e89b-12d3-a456-426614174000" },
    ],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: { id: "uuid", name: "Chat Name", is_group: false, members: [], created_at: "2026-01-07T10:00:00Z" } } },
      { status: 404, description: "Not found", example: { success: false, error: { code: "NOT_FOUND", message: "Conversation not found" } } },
    ],
  },
  {
    method: "POST",
    path: "/api-chat/conversations",
    description: "Create a new conversation",
    summary: "Start a new direct message or group conversation with specified users.",
    category: "chat",
    auth_required: true,
    permissions: ["chat"],
    parameters: [],
    request_body: {
      content_type: "application/json",
      example: { member_ids: ["user-uuid-1", "user-uuid-2"], name: "My Group Chat", is_group: true },
    },
    responses: [
      { status: 201, description: "Created", example: { success: true, data: { id: "new-uuid", name: "My Group Chat", is_group: true } } },
      { status: 400, description: "Validation error", example: { success: false, error: { code: "VALIDATION_ERROR", message: "member_ids is required" } } },
    ],
  },
  {
    method: "GET",
    path: "/api-chat/conversations/:id/messages",
    description: "Get messages in a conversation",
    summary: "Retrieve messages from a specific conversation with pagination support.",
    category: "chat",
    auth_required: true,
    permissions: ["chat"],
    parameters: [
      { name: "id", in: "path", type: "uuid", required: true, description: "Conversation ID" },
      { name: "limit", in: "query", type: "integer", required: false, description: "Maximum messages to return", example: "50" },
      { name: "before", in: "query", type: "string", required: false, description: "Cursor for pagination (message ID)" },
    ],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: [{ id: "uuid", content: "Hello!", sender_id: "user-uuid", created_at: "2026-01-07T10:00:00Z" }], meta: { count: 1, has_more: false } } },
    ],
  },
  {
    method: "POST",
    path: "/api-chat/conversations/:id/messages",
    description: "Send a message",
    summary: "Send a new text message to a conversation.",
    category: "chat",
    auth_required: true,
    permissions: ["chat"],
    parameters: [
      { name: "id", in: "path", type: "uuid", required: true, description: "Conversation ID" },
    ],
    request_body: {
      content_type: "application/json",
      example: { content: "Hello from the API!", message_type: "text" },
    },
    responses: [
      { status: 201, description: "Created", example: { success: true, data: { id: "new-uuid", content: "Hello from the API!", sender_id: "your-user-id", created_at: "2026-01-07T10:00:00Z" } } },
    ],
  },
  // Users endpoints
  {
    method: "GET",
    path: "/api-users/me",
    description: "Get your profile",
    summary: "Retrieve the authenticated user's profile information.",
    category: "users",
    auth_required: true,
    permissions: ["users"],
    parameters: [],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: { id: "uuid", username: "johndoe", display_name: "John Doe", avatar_url: null, status: "online" } } },
    ],
  },
  {
    method: "PUT",
    path: "/api-users/me",
    description: "Update your profile",
    summary: "Update the authenticated user's profile information.",
    category: "users",
    auth_required: true,
    permissions: ["users"],
    parameters: [],
    request_body: {
      content_type: "application/json",
      example: { display_name: "New Name", status: "away" },
    },
    responses: [
      { status: 200, description: "Success", example: { success: true, data: { id: "uuid", username: "johndoe", display_name: "New Name", status: "away" } } },
    ],
  },
  {
    method: "GET",
    path: "/api-users/search",
    description: "Search for users",
    summary: "Search for users by username or display name.",
    category: "users",
    auth_required: true,
    permissions: ["users"],
    parameters: [
      { name: "q", in: "query", type: "string", required: true, description: "Search query", example: "john" },
      { name: "limit", in: "query", type: "integer", required: false, description: "Maximum results", example: "10" },
    ],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: [{ id: "uuid", username: "johndoe", display_name: "John Doe" }], meta: { count: 1 } } },
    ],
  },
  // Calls endpoints
  {
    method: "POST",
    path: "/api-calls/initiate",
    description: "Initiate a call",
    summary: "Start a new video or voice call in a conversation.",
    category: "calls",
    auth_required: true,
    permissions: ["calls"],
    parameters: [],
    request_body: {
      content_type: "application/json",
      example: { conversation_id: "conv-uuid", call_type: "video" },
    },
    responses: [
      { status: 201, description: "Created", example: { success: true, data: { id: "call-uuid", channel_name: "call_xxxxx", status: "ringing" } } },
    ],
  },
  {
    method: "GET",
    path: "/api-calls/history",
    description: "Get call history",
    summary: "Retrieve your call history with pagination.",
    category: "calls",
    auth_required: true,
    permissions: ["calls"],
    parameters: [
      { name: "limit", in: "query", type: "integer", required: false, description: "Maximum calls to return", example: "20" },
    ],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: [{ id: "uuid", call_type: "video", status: "ended", duration: 300 }], meta: { count: 1 } } },
    ],
  },
  // Crypto endpoints
  {
    method: "POST",
    path: "/api-crypto/transfer",
    description: "Create a crypto transfer",
    summary: "Send cryptocurrency to another user.",
    category: "crypto",
    auth_required: true,
    permissions: ["crypto"],
    parameters: [],
    request_body: {
      content_type: "application/json",
      example: { to_user_id: "recipient-uuid", amount: 10.5, currency: "CAMLY", tx_hash: "0x..." },
    },
    responses: [
      { status: 201, description: "Created", example: { success: true, data: { id: "tx-uuid", amount: 10.5, currency: "CAMLY", status: "pending" } } },
    ],
  },
  {
    method: "GET",
    path: "/api-crypto/history",
    description: "Get transaction history",
    summary: "Retrieve your cryptocurrency transaction history.",
    category: "crypto",
    auth_required: true,
    permissions: ["crypto"],
    parameters: [
      { name: "limit", in: "query", type: "integer", required: false, description: "Maximum transactions", example: "50" },
      { name: "status", in: "query", type: "string", required: false, description: "Filter by status", example: "completed" },
    ],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: [{ id: "uuid", amount: 10.5, currency: "CAMLY", status: "completed", tx_hash: "0x..." }], meta: { count: 1 } } },
    ],
  },
  {
    method: "GET",
    path: "/api-crypto/stats",
    description: "Get transaction statistics",
    summary: "Get aggregated statistics about your crypto transactions.",
    category: "crypto",
    auth_required: true,
    permissions: ["crypto"],
    parameters: [],
    responses: [
      { status: 200, description: "Success", example: { success: true, data: { total_sent: 100, total_received: 50, transaction_count: 25 } } },
    ],
  },
];

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
}

export function ApiExplorer() {
  const { user } = useAuth();
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointSchema | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [userApiKeys, setUserApiKeys] = useState<ApiKey[]>([]);
  const [selectedKeyPrefix, setSelectedKeyPrefix] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    data: unknown;
    time: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("explorer");

  // Fetch user's API keys
  useEffect(() => {
    if (user) {
      fetchApiKeys();
    }
  }, [user]);

  const fetchApiKeys = async () => {
    try {
      const response = await api.apiKeys.list();
      if (!response.ok || !response.data) {
        setUserApiKeys([]);
        return;
      }
      const keys = response.data.keys || [];
      setUserApiKeys(
        keys
          .filter((k: any) => k?.is_active !== false)
          .map((k: any) => ({
            id: k.id,
            name: k.name,
            key_prefix: k.key_prefix,
          }))
      );
    } catch (e) {
      console.error("[ApiExplorer] fetchApiKeys error:", e);
      setUserApiKeys([]);
    }
  };

  const handleEndpointSelect = (path: string) => {
    const endpoint = endpointSchemas.find((e) => `${e.method} ${e.path}` === path);
    setSelectedEndpoint(endpoint || null);
    setParams({});
    setResponse(null);
    
    if (endpoint?.request_body) {
      setBody(JSON.stringify(endpoint.request_body.example, null, 2));
    } else {
      setBody("");
    }
  };

  const handleApiKeySelect = (keyId: string) => {
    const key = userApiKeys.find((k) => k.id === keyId);
    if (key) {
      // Secrets are never returned by the API after creation; user must paste it manually.
      setSelectedKeyPrefix(key.key_prefix);
    }
  };

  const buildUrl = () => {
    if (!selectedEndpoint) return "";
    
    let path = selectedEndpoint.path;
    
    // Replace path parameters
    selectedEndpoint.parameters
      .filter((p) => p.in === "path")
      .forEach((param) => {
        path = path.replace(`:${param.name}`, params[param.name] || `:${param.name}`);
      });
    
    // Add query parameters
    const queryParams = selectedEndpoint.parameters
      .filter((p) => p.in === "query" && params[p.name])
      .map((p) => `${p.name}=${encodeURIComponent(params[p.name])}`)
      .join("&");
    
    return `${BASE_URL}${path}${queryParams ? `?${queryParams}` : ""}`;
  };

  const executeRequest = async () => {
    if (!selectedEndpoint || !apiKey) return;
    
    setLoading(true);
    setResponse(null);
    
    const startTime = Date.now();
    
    try {
      const url = buildUrl();
      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers: {
          // API Gateway expects FunChat API key in a dedicated header
          "x-funchat-api-key": apiKey,
          "Content-Type": "application/json",
        },
      };
      
      if (selectedEndpoint.method !== "GET" && body) {
        options.body = body;
      }
      
      const res = await fetch(url, options);
      const data = await res.json();
      
      setResponse({
        status: res.status,
        statusText: res.statusText,
        data,
        time: Date.now() - startTime,
      });
    } catch (error) {
      setResponse({
        status: 0,
        statusText: "Network Error",
        data: { error: "Failed to connect. Check your network or CORS settings." },
        time: Date.now() - startTime,
      });
    } finally {
      setLoading(false);
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "POST": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "PUT": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "DELETE": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const groupedEndpoints = endpointSchemas.reduce((acc, endpoint) => {
    if (!acc[endpoint.category]) {
      acc[endpoint.category] = [];
    }
    acc[endpoint.category].push(endpoint);
    return acc;
  }, {} as Record<string, EndpointSchema[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Interactive API Explorer
        </CardTitle>
        <CardDescription>
          Test API endpoints directly from the documentation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="explorer">Try It</TabsTrigger>
            <TabsTrigger value="details">Endpoint Details</TabsTrigger>
          </TabsList>

          <TabsContent value="explorer" className="space-y-4">
            {/* API Key Selection */}
            <div className="space-y-2">
              <Label>API Key</Label>
              {userApiKeys.length > 0 ? (
                <div className="space-y-2">
                  <Select onValueChange={handleApiKeySelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an API key (prefix only)" />
                    </SelectTrigger>
                    <SelectContent>
                      {userApiKeys.map((key) => (
                        <SelectItem key={key.id} value={key.id}>
                          {key.name} ({key.key_prefix}...)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={
                      selectedKeyPrefix
                        ? `Paste your API key secret (starts with ${selectedKeyPrefix}...)`
                        : "Paste your API key secret (fc_live_...)"
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    type="password"
                    className="font-mono"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Enter your API key (fc_live_...)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    type="password"
                    className="font-mono"
                  />
                  {!user && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      <span>Sign in to use saved keys</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Endpoint Selection */}
            <div className="space-y-2">
              <Label>Endpoint</Label>
              <Select onValueChange={handleEndpointSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an endpoint" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedEndpoints).map(([category, endpoints]) => (
                    <div key={category}>
                      <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground capitalize">
                        {category}
                      </div>
                      {endpoints.map((endpoint) => (
                        <SelectItem
                          key={`${endpoint.method} ${endpoint.path}`}
                          value={`${endpoint.method} ${endpoint.path}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`${getMethodColor(endpoint.method)} text-xs`}>
                              {endpoint.method}
                            </Badge>
                            <span className="font-mono text-sm">{endpoint.path}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parameters */}
            {selectedEndpoint && selectedEndpoint.parameters.length > 0 && (
              <div className="space-y-3">
                <Label>Parameters</Label>
                <div className="grid gap-3">
                  {selectedEndpoint.parameters.map((param) => (
                    <div key={param.name} className="grid grid-cols-3 gap-2 items-center">
                      <div className="flex items-center gap-2">
                        <code className="text-sm">{param.name}</code>
                        {param.required && (
                          <Badge variant="destructive" className="text-xs">Required</Badge>
                        )}
                      </div>
                      <Input
                        className="col-span-2"
                        placeholder={param.example || param.description}
                        value={params[param.name] || ""}
                        onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Request Body */}
            {selectedEndpoint?.request_body && (
              <div className="space-y-2">
                <Label>Request Body (JSON)</Label>
                <Textarea
                  className="font-mono text-sm min-h-[120px]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="{}"
                />
              </div>
            )}

            {/* Execute Button */}
            <Button
              onClick={executeRequest}
              disabled={!selectedEndpoint || !apiKey || loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Try it!
            </Button>

            {/* Request URL Preview */}
            {selectedEndpoint && (
              <div className="p-3 bg-muted rounded-lg">
                <Label className="text-xs text-muted-foreground">Request URL</Label>
                <code className="text-sm block mt-1 break-all">{buildUrl()}</code>
              </div>
            )}

            {/* Response */}
            <div className="space-y-2">
              <Label>Response</Label>
              <ResponseViewer response={response} loading={loading} />
            </div>
          </TabsContent>

          <TabsContent value="details">
            {selectedEndpoint ? (
              <EndpointDetail endpoint={selectedEndpoint} baseUrl={BASE_URL} />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Select an endpoint above to see detailed documentation
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
