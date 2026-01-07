import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

export interface EndpointParameter {
  name: string;
  in: "path" | "query" | "body";
  type: string;
  required: boolean;
  description: string;
  example?: string;
}

export interface EndpointSchema {
  method: string;
  path: string;
  description: string;
  summary: string;
  category: string;
  auth_required: boolean;
  permissions: string[];
  parameters: EndpointParameter[];
  request_body?: {
    content_type: string;
    example: Record<string, unknown>;
  };
  responses: {
    status: number;
    description: string;
    example: Record<string, unknown>;
  }[];
}

interface EndpointDetailProps {
  endpoint: EndpointSchema;
  baseUrl: string;
}

export function EndpointDetail({ endpoint, baseUrl }: EndpointDetailProps) {
  const [copiedCurl, setCopiedCurl] = useState(false);

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "POST": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "PUT": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "DELETE": return "bg-red-500/10 text-red-500 border-red-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const generateCurl = () => {
    let curl = `curl -X ${endpoint.method} '${baseUrl}${endpoint.path}'`;
    curl += ` \\\n  -H 'Authorization: Bearer YOUR_API_KEY'`;
    curl += ` \\\n  -H 'Content-Type: application/json'`;
    
    if (endpoint.request_body && endpoint.method !== "GET") {
      curl += ` \\\n  -d '${JSON.stringify(endpoint.request_body.example)}'`;
    }
    
    return curl;
  };

  const copyCurl = () => {
    navigator.clipboard.writeText(generateCurl());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="space-y-6 p-4 border rounded-lg">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={getMethodColor(endpoint.method)}>
              {endpoint.method}
            </Badge>
            <code className="text-sm font-medium">{endpoint.path}</code>
          </div>
          <p className="text-muted-foreground">{endpoint.summary}</p>
        </div>
        <Button size="sm" variant="outline" onClick={copyCurl}>
          {copiedCurl ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
          Copy cURL
        </Button>
      </div>

      {/* Auth & Permissions */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Auth:</span>
          <Badge variant={endpoint.auth_required ? "default" : "secondary"}>
            {endpoint.auth_required ? "Required" : "Not Required"}
          </Badge>
        </div>
        {endpoint.permissions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Permissions:</span>
            {endpoint.permissions.map((perm) => (
              <Badge key={perm} variant="outline">{perm}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Parameters */}
      {endpoint.parameters.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Parameters</h4>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Location</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Required</th>
                  <th className="text-left p-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.parameters.map((param) => (
                  <tr key={param.name} className="border-t">
                    <td className="p-3">
                      <code className="text-primary">{param.name}</code>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-xs">{param.in}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{param.type}</td>
                    <td className="p-3">
                      {param.required ? (
                        <Badge variant="destructive" className="text-xs">Required</Badge>
                      ) : (
                        <span className="text-muted-foreground">Optional</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{param.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Request Body */}
      {endpoint.request_body && (
        <div className="space-y-3">
          <h4 className="font-medium">Request Body</h4>
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
            <code>{JSON.stringify(endpoint.request_body.example, null, 2)}</code>
          </pre>
        </div>
      )}

      {/* Responses */}
      <div className="space-y-3">
        <h4 className="font-medium">Responses</h4>
        <div className="space-y-2">
          {endpoint.responses.map((resp) => (
            <div key={resp.status} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 p-3 bg-muted/50 border-b">
                <Badge 
                  variant="outline" 
                  className={
                    resp.status >= 200 && resp.status < 300 
                      ? "bg-green-500/10 text-green-500 border-green-500/20"
                      : "bg-red-500/10 text-red-500 border-red-500/20"
                  }
                >
                  {resp.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{resp.description}</span>
              </div>
              <pre className="p-4 overflow-x-auto text-sm bg-background">
                <code>{JSON.stringify(resp.example, null, 2)}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
