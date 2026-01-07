import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface ResponseViewerProps {
  response: {
    status: number;
    statusText: string;
    data: unknown;
    time: number;
  } | null;
  loading?: boolean;
}

export function ResponseViewer({ response, loading }: ResponseViewerProps) {
  const [copied, setCopied] = useState(false);

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (status >= 400 && status < 500) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    if (status >= 500) return "bg-red-500/10 text-red-500 border-red-500/20";
    return "bg-muted text-muted-foreground";
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="border rounded-lg p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Sending request...</p>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="border rounded-lg p-8 text-center border-dashed">
        <p className="text-muted-foreground">
          Click "Try it!" to see the response here
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Response Header */}
      <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={getStatusColor(response.status)}>
            {response.status} {response.statusText}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {response.time}ms
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={copyResponse}>
          {copied ? (
            <Check className="h-4 w-4 mr-1" />
          ) : (
            <Copy className="h-4 w-4 mr-1" />
          )}
          Copy
        </Button>
      </div>
      
      {/* Response Body */}
      <pre className="p-4 overflow-x-auto text-sm max-h-[400px] overflow-y-auto bg-background">
        <code className="text-foreground">
          {JSON.stringify(response.data, null, 2)}
        </code>
      </pre>
    </div>
  );
}
