import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, MessageSquare, Users, Phone, Coins, 
  Key, Copy, Check, Search, Book, Code, Zap, Shield
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ApiExplorer } from "@/components/api-docs/ApiExplorer";

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

  react: `// React/Next.js Integration Example
import { useState, useEffect } from 'react';

const API_KEY = process.env.NEXT_PUBLIC_FUNCHAT_API_KEY;
const BASE_URL = '${BASE_URL}';

// Custom hook for FunChat API
function useFunChat() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const res = await fetch(\`\${BASE_URL}/api-chat/conversations\`, {
        headers: { 'Authorization': \`Bearer \${API_KEY}\` }
      });
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (conversationId, content) => {
    const res = await fetch(
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
    return res.json();
  };

  return { conversations, loading, fetchConversations, sendMessage };
}

// Usage in component
function ChatComponent() {
  const { conversations, loading, fetchConversations, sendMessage } = useFunChat();

  useEffect(() => {
    fetchConversations();
  }, []);

  return (
    <div>
      {loading ? <p>Loading...</p> : (
        <ul>
          {conversations.map(conv => (
            <li key={conv.id}>{conv.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}`,
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

const navItems = [
  { id: "quickstart", label: "Quick Start", icon: Zap },
  { id: "explorer", label: "API Explorer", icon: Code },
  { id: "endpoints", label: "Endpoints", icon: Book },
  { id: "examples", label: "Code Examples", icon: Code },
  { id: "auth", label: "Authentication", icon: Shield },
  { id: "errors", label: "Errors", icon: Shield },
];

export default function ApiDocs() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("quickstart");

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

  // Filter endpoints based on search
  const filteredEndpoints = Object.entries(endpoints).reduce((acc, [category, categoryEndpoints]) => {
    const filtered = categoryEndpoints.filter(
      (e) =>
        e.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {} as typeof endpoints);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:block w-64 border-r h-screen sticky top-0">
          <div className="p-4 border-b">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h2 className="font-semibold text-lg">API Documentation</h2>
            <p className="text-sm text-muted-foreground">v1.0</p>
          </div>
          <ScrollArea className="h-[calc(100vh-120px)]">
            <nav className="p-4 space-y-1">
              {navItems.map((item) => (
                <Button
                  key={item.id}
                  variant={activeSection === item.id ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => scrollToSection(item.id)}
                >
                  <item.icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Button>
              ))}
              <div className="pt-4 border-t mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 px-2">ENDPOINTS</p>
                {Object.keys(endpoints).map((category) => (
                  <Button
                    key={category}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start capitalize"
                    onClick={() => scrollToSection("endpoints")}
                  >
                    {category === "chat" && <MessageSquare className="h-4 w-4 mr-2" />}
                    {category === "users" && <Users className="h-4 w-4 mr-2" />}
                    {category === "calls" && <Phone className="h-4 w-4 mr-2" />}
                    {category === "crypto" && <Coins className="h-4 w-4 mr-2" />}
                    {category} API
                  </Button>
                ))}
              </div>
            </nav>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="container max-w-4xl py-8 px-4 lg:px-8">
            {/* Mobile Header */}
            <div className="lg:hidden flex items-center gap-4 mb-8">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">API Documentation</h1>
                <p className="text-sm text-muted-foreground">v1.0</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search endpoints, methods, or descriptions..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Quick Start Section */}
            <section id="quickstart" className="mb-12">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Quick Start
                  </CardTitle>
                  <CardDescription>
                    Get started with the FunChat API in minutes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="border rounded-lg p-4 space-y-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
                      <h4 className="font-medium">Get your API Key</h4>
                      <p className="text-sm text-muted-foreground">
                        Create an API key from the{" "}
                        <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/api-keys")}>
                          API Keys page
                        </Button>
                      </p>
                    </div>
                    <div className="border rounded-lg p-4 space-y-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
                      <h4 className="font-medium">Add Authorization Header</h4>
                      <p className="text-sm text-muted-foreground">
                        Include your API key in every request
                      </p>
                    </div>
                    <div className="border rounded-lg p-4 space-y-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
                      <h4 className="font-medium">Make Requests</h4>
                      <p className="text-sm text-muted-foreground">
                        Start integrating with our endpoints
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Base URL</h4>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-3 py-2 rounded-lg text-sm flex-1 overflow-x-auto">
                        {BASE_URL}
                      </code>
                      <Button size="icon" variant="outline" onClick={() => copyCode(BASE_URL, "Base URL")}>
                        {copiedCode === "Base URL" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-medium">Authorization Header</h4>
                    <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                      Authorization: Bearer fc_live_your_api_key_here
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* API Explorer Section */}
            <section id="explorer" className="mb-12">
              <ApiExplorer />
            </section>

            {/* API Endpoints Section */}
            <section id="endpoints" className="mb-12">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Book className="h-5 w-5" />
                    API Endpoints
                  </CardTitle>
                  <CardDescription>
                    All available endpoints organized by category
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="chat">
                    <TabsList className="grid grid-cols-4 w-full">
                      <TabsTrigger value="chat" className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">Chat</span>
                      </TabsTrigger>
                      <TabsTrigger value="users" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span className="hidden sm:inline">Users</span>
                      </TabsTrigger>
                      <TabsTrigger value="calls" className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span className="hidden sm:inline">Calls</span>
                      </TabsTrigger>
                      <TabsTrigger value="crypto" className="flex items-center gap-2">
                        <Coins className="h-4 w-4" />
                        <span className="hidden sm:inline">Crypto</span>
                      </TabsTrigger>
                    </TabsList>

                    {Object.entries(searchQuery ? filteredEndpoints : endpoints).map(([category, categoryEndpoints]) => (
                      <TabsContent key={category} value={category} className="mt-4">
                        <div className="space-y-2">
                          {categoryEndpoints.map((endpoint, idx) => (
                            <div 
                              key={idx}
                              className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                            >
                              <Badge variant="outline" className={getMethodColor(endpoint.method)}>
                                {endpoint.method}
                              </Badge>
                              <code className="text-sm flex-1 truncate">{endpoint.path}</code>
                              <span className="text-sm text-muted-foreground hidden md:block">{endpoint.description}</span>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Code Examples Section */}
            <section id="examples" className="mb-12">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Code Examples
                  </CardTitle>
                  <CardDescription>
                    Ready-to-use code snippets in popular languages and frameworks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="javascript">
                    <TabsList className="flex-wrap h-auto">
                      <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                      <TabsTrigger value="python">Python</TabsTrigger>
                      <TabsTrigger value="curl">cURL</TabsTrigger>
                      <TabsTrigger value="react">React/Next.js</TabsTrigger>
                    </TabsList>

                    {Object.entries(codeExamples).map(([lang, code]) => (
                      <TabsContent key={lang} value={lang}>
                        <div className="relative">
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="absolute top-2 right-2 z-10"
                            onClick={() => copyCode(code, lang)}
                          >
                            {copiedCode === lang ? (
                              <Check className="h-4 w-4 mr-1" />
                            ) : (
                              <Copy className="h-4 w-4 mr-1" />
                            )}
                            Copy
                          </Button>
                          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm max-h-[500px] overflow-y-auto">
                            <code>{code}</code>
                          </pre>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            </section>

            {/* Authentication Section */}
            <section id="auth" className="mb-12">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Authentication
                  </CardTitle>
                  <CardDescription>
                    How to authenticate your API requests
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <h4 className="font-medium">API Key Authentication</h4>
                    <p className="text-sm text-muted-foreground">
                      All API requests must include a valid API key in the Authorization header. 
                      API keys start with <code className="bg-muted px-1 rounded">fc_live_</code> for production 
                      or <code className="bg-muted px-1 rounded">fc_test_</code> for testing.
                    </p>
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="text-sm overflow-x-auto">
{`// Include in every request
headers: {
  'Authorization': 'Bearer fc_live_your_api_key_here',
  'Content-Type': 'application/json'
}`}
                      </pre>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">API Key Permissions</h4>
                    <p className="text-sm text-muted-foreground">
                      Each API key can be configured with specific permissions:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="border rounded-lg p-3">
                        <Badge className="mb-2">chat</Badge>
                        <p className="text-sm text-muted-foreground">Access conversations and messages</p>
                      </div>
                      <div className="border rounded-lg p-3">
                        <Badge className="mb-2">users</Badge>
                        <p className="text-sm text-muted-foreground">Search and view user profiles</p>
                      </div>
                      <div className="border rounded-lg p-3">
                        <Badge className="mb-2">calls</Badge>
                        <p className="text-sm text-muted-foreground">Initiate and manage calls</p>
                      </div>
                      <div className="border rounded-lg p-3">
                        <Badge className="mb-2">crypto</Badge>
                        <p className="text-sm text-muted-foreground">Create and view transactions</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Error Codes Section */}
            <section id="errors" className="mb-12">
              <Card>
                <CardHeader>
                  <CardTitle>Error Codes</CardTitle>
                  <CardDescription>
                    Common error codes and their meanings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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

                  <div className="space-y-2">
                    <h4 className="font-medium">Error Response Format</h4>
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
            </section>

            {/* Rate Limits */}
            <section id="ratelimits" className="mb-12">
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
                    <div className="border rounded-lg p-4 border-primary bg-primary/5">
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
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
