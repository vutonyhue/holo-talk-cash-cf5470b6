import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, MessageSquare, Users, Phone, Coins, 
  Key, Copy, ExternalLink, Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = "https://dgeadmmbkvcsgizsnbpi.supabase.co/functions/v1";

const endpoints = {
  chat: [
    { method: "GET", path: "/api-chat/conversations", description: "List all conversations" },
    { method: "GET", path: "/api-chat/conversations/:id", description: "Get a specific conversation" },
    { method: "POST", path: "/api-chat/conversations", description: "Create a new conversation" },
    { method: "GET", path: "/api-chat/conversations/:id/messages", description: "Get messages in a conversation" },
    { method: "POST", path: "/api-chat/conversations/:id/messages", description: "Send a message" },
    { method: "DELETE", path: "/api-chat/messages/:id", description: "Delete a message" },
  ],
  users: [
    { method: "GET", path: "/api-users/me", description: "Get your profile" },
    { method: "PUT", path: "/api-users/me", description: "Update your profile" },
    { method: "GET", path: "/api-users/search?q={query}", description: "Search for users" },
    { method: "GET", path: "/api-users/:id", description: "Get a user's public profile" },
  ],
  calls: [
    { method: "POST", path: "/api-calls/initiate", description: "Initiate a call" },
    { method: "PUT", path: "/api-calls/:id/status", description: "Update call status" },
    { method: "GET", path: "/api-calls/history", description: "Get call history" },
    { method: "GET", path: "/api-calls/:id", description: "Get call details" },
  ],
  crypto: [
    { method: "POST", path: "/api-crypto/transfer", description: "Create a crypto transfer" },
    { method: "GET", path: "/api-crypto/history", description: "Get transaction history" },
    { method: "GET", path: "/api-crypto/stats", description: "Get transaction statistics" },
  ],
};

const codeExamples = {
  javascript: `// Install: npm install node-fetch (if using Node.js)

const API_KEY = 'fc_live_your_api_key_here';
const BASE_URL = '${BASE_URL}';

// Get all conversations
async function getConversations() {
  const response = await fetch(\`\${BASE_URL}/api-chat/conversations\`, {
    method: 'GET',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  console.log(data);
  return data;
}

// Send a message
async function sendMessage(conversationId, content) {
  const response = await fetch(
    \`\${BASE_URL}/api-chat/conversations/\${conversationId}/messages\`,
    {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    }
  );
  
  return response.json();
}

// Search users
async function searchUsers(query) {
  const response = await fetch(
    \`\${BASE_URL}/api-users/search?q=\${encodeURIComponent(query)}\`,
    {
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`
      }
    }
  );
  
  return response.json();
}`,

  python: `import requests

API_KEY = 'fc_live_your_api_key_here'
BASE_URL = '${BASE_URL}'

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

# Get all conversations
def get_conversations():
    response = requests.get(
        f'{BASE_URL}/api-chat/conversations',
        headers=headers
    )
    return response.json()

# Send a message
def send_message(conversation_id, content):
    response = requests.post(
        f'{BASE_URL}/api-chat/conversations/{conversation_id}/messages',
        headers=headers,
        json={'content': content}
    )
    return response.json()

# Search users
def search_users(query):
    response = requests.get(
        f'{BASE_URL}/api-users/search',
        headers=headers,
        params={'q': query}
    )
    return response.json()

# Example usage
if __name__ == '__main__':
    conversations = get_conversations()
    print(conversations)`,

  curl: `# Get all conversations
curl -X GET '${BASE_URL}/api-chat/conversations' \\
  -H 'Authorization: Bearer fc_live_your_api_key_here' \\
  -H 'Content-Type: application/json'

# Send a message
curl -X POST '${BASE_URL}/api-chat/conversations/{conversation_id}/messages' \\
  -H 'Authorization: Bearer fc_live_your_api_key_here' \\
  -H 'Content-Type: application/json' \\
  -d '{"content": "Hello from the API!"}'

# Search users
curl -X GET '${BASE_URL}/api-users/search?q=john' \\
  -H 'Authorization: Bearer fc_live_your_api_key_here'

# Get your profile
curl -X GET '${BASE_URL}/api-users/me' \\
  -H 'Authorization: Bearer fc_live_your_api_key_here'

# Create a crypto transfer
curl -X POST '${BASE_URL}/api-crypto/transfer' \\
  -H 'Authorization: Bearer fc_live_your_api_key_here' \\
  -H 'Content-Type: application/json' \\
  -d '{"to_user_id": "user-uuid", "amount": 10, "currency": "CAMLY"}'`,
};

const errorCodes = [
  { code: "UNAUTHORIZED", status: 401, description: "Invalid or missing API key" },
  { code: "FORBIDDEN", status: 403, description: "API key doesn't have required permissions" },
  { code: "NOT_FOUND", status: 404, description: "Resource not found" },
  { code: "VALIDATION_ERROR", status: 400, description: "Invalid request parameters" },
  { code: "RATE_LIMITED", status: 429, description: "Too many requests, try again later" },
  { code: "DATABASE_ERROR", status: 500, description: "Database operation failed" },
  { code: "INTERNAL_ERROR", status: 500, description: "Unexpected server error" },
];

export default function ApiDocs() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(label);
    toast({ title: "Copied!", description: `${label} code copied to clipboard` });
    setTimeout(() => setCopiedCode(null), 2000);
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

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">API Documentation</h1>
            <p className="text-muted-foreground">
              Integrate FunChat into your applications
            </p>
          </div>
        </div>

        {/* Quick Start */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Quick Start
            </CardTitle>
            <CardDescription>
              Get started with the FunChat API in minutes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">1. Get your API Key</h4>
              <p className="text-sm text-muted-foreground">
                Create an API key from the{" "}
                <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/api-keys")}>
                  API Keys page
                </Button>
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">2. Make your first request</h4>
              <p className="text-sm text-muted-foreground">
                Include your API key in the Authorization header:
              </p>
              <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                Authorization: Bearer fc_live_your_api_key_here
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">3. Base URL</h4>
              <div className="flex items-center gap-2">
                <code className="bg-muted px-3 py-2 rounded-lg text-sm flex-1">
                  {BASE_URL}
                </code>
                <Button size="icon" variant="outline" onClick={() => copyCode(BASE_URL, "Base URL")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Endpoints */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>API Endpoints</CardTitle>
            <CardDescription>
              All available endpoints organized by category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="chat">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="chat" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </TabsTrigger>
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Users
                </TabsTrigger>
                <TabsTrigger value="calls" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Calls
                </TabsTrigger>
                <TabsTrigger value="crypto" className="flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  Crypto
                </TabsTrigger>
              </TabsList>

              {Object.entries(endpoints).map(([category, categoryEndpoints]) => (
                <TabsContent key={category} value={category} className="mt-4">
                  <div className="space-y-2">
                    {categoryEndpoints.map((endpoint, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <Badge variant="outline" className={getMethodColor(endpoint.method)}>
                          {endpoint.method}
                        </Badge>
                        <code className="text-sm flex-1">{endpoint.path}</code>
                        <span className="text-sm text-muted-foreground">{endpoint.description}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Code Examples */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Code Examples</CardTitle>
            <CardDescription>
              Ready-to-use code snippets in popular languages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="javascript">
              <TabsList>
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
              </TabsList>

              {Object.entries(codeExamples).map(([lang, code]) => (
                <TabsContent key={lang} value={lang}>
                  <div className="relative">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => copyCode(code, lang)}
                    >
                      {copiedCode === lang ? (
                        <Check className="h-4 w-4 mr-1" />
                      ) : (
                        <Copy className="h-4 w-4 mr-1" />
                      )}
                      Copy
                    </Button>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{code}</code>
                    </pre>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Response Format */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Response Format</CardTitle>
            <CardDescription>
              All API responses follow a consistent format
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Success Response</h4>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-01-07T10:30:00Z",
    "count": 10  // for list endpoints
  }
}`}
              </pre>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Error Response</h4>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Error Codes */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Error Codes</CardTitle>
            <CardDescription>
              Common error codes and their meanings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {errorCodes.map((error) => (
                <div 
                  key={error.code}
                  className="flex items-center gap-4 p-3 border rounded-lg"
                >
                  <Badge variant="outline">{error.status}</Badge>
                  <code className="text-sm font-medium">{error.code}</code>
                  <span className="text-sm text-muted-foreground flex-1">{error.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Rate Limits</CardTitle>
            <CardDescription>
              API rate limits based on your plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Free</h4>
                <p className="text-2xl font-bold">60</p>
                <p className="text-sm text-muted-foreground">requests/minute</p>
              </div>
              <div className="border rounded-lg p-4 border-primary">
                <h4 className="font-medium mb-2">Pro</h4>
                <p className="text-2xl font-bold">300</p>
                <p className="text-sm text-muted-foreground">requests/minute</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2">Enterprise</h4>
                <p className="text-2xl font-bold">1000</p>
                <p className="text-sm text-muted-foreground">requests/minute</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
