import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WebhookPayloadViewerProps {
  payload: Record<string, unknown> | string;
  title?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function WebhookPayloadViewer({
  payload,
  title,
  maxHeight = '300px',
  showLineNumbers = true,
  collapsible = false,
  defaultCollapsed = false,
}: WebhookPayloadViewerProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const payloadString = typeof payload === 'string' 
    ? payload 
    : JSON.stringify(payload, null, 2);

  const lines = payloadString.split('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadString);
    setCopied(true);
    toast.success('Đã copy!');
    setTimeout(() => setCopied(false), 2000);
  };

  const getLineColor = (line: string): string => {
    const trimmed = line.trim();
    if (trimmed.startsWith('"') && trimmed.includes('":')) {
      return 'text-blue-400'; // Keys
    }
    if (trimmed.startsWith('"')) {
      return 'text-green-400'; // String values
    }
    if (/^-?\d/.test(trimmed) || trimmed === 'true' || trimmed === 'false') {
      return 'text-orange-400'; // Numbers and booleans
    }
    if (trimmed === 'null') {
      return 'text-gray-500'; // Null
    }
    return 'text-foreground';
  };

  return (
    <div className="rounded-lg border bg-muted/50 overflow-hidden">
      {title && (
        <div 
          className={cn(
            "flex items-center justify-between px-3 py-2 border-b bg-muted",
            collapsible && "cursor-pointer hover:bg-muted/80"
          )}
          onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
        >
          <div className="flex items-center gap-2">
            {collapsible && (
              collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{title}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="h-7 px-2"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
      
      {(!collapsible || !collapsed) && (
        <div 
          className="overflow-auto font-mono text-xs"
          style={{ maxHeight }}
        >
          <div className="p-3 flex">
            {showLineNumbers && (
              <div className="pr-3 border-r mr-3 text-muted-foreground select-none">
                {lines.map((_, i) => (
                  <div key={i} className="leading-5 text-right">
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <pre className="flex-1 overflow-x-auto">
              {lines.map((line, i) => (
                <div key={i} className={cn("leading-5", getLineColor(line))}>
                  {line || ' '}
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}

      {!title && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="absolute top-2 right-2 h-7 px-2"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}
