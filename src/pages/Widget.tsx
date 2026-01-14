/**
 * Widget Page
 * Standalone page for embedded chat widget
 */

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WidgetChat } from '@/components/widget/WidgetChat';

export default function Widget() {
  const [searchParams] = useSearchParams();
  
  const token = searchParams.get('token') || '';
  const theme = (searchParams.get('theme') || 'auto') as 'light' | 'dark' | 'auto';

  // Hide scrollbars and adjust for iframe
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.documentElement.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.margin = '';
      document.body.style.padding = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  // Apply initial theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // Auto: check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, [theme]);

  if (!token) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground p-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Token Required</h2>
          <p className="text-sm text-muted-foreground">
            Please provide a valid widget token in the URL.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <WidgetChat token={token} theme={theme} />
    </div>
  );
}
