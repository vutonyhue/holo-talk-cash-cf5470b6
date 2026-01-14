/**
 * Widget Authentication Hook
 * Handles token validation and user context for embedded widgets
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WidgetAuthContext {
  isValid: boolean;
  isLoading: boolean;
  error: string | null;
  userId: string | null;
  appId: string | null;
  conversationId: string | null;
  scopes: string[];
  expiresAt: string | null;
}

export interface UseWidgetAuthResult extends WidgetAuthContext {
  validateToken: (token: string) => Promise<boolean>;
  refreshToken: () => Promise<string | null>;
  hasScope: (scope: string) => boolean;
}

export function useWidgetAuth(initialToken?: string): UseWidgetAuthResult {
  const [authContext, setAuthContext] = useState<WidgetAuthContext>({
    isValid: false,
    isLoading: !!initialToken,
    error: null,
    userId: null,
    appId: null,
    conversationId: null,
    scopes: [],
    expiresAt: null,
  });

  const [currentToken, setCurrentToken] = useState<string | null>(initialToken || null);

  const validateToken = useCallback(async (token: string): Promise<boolean> => {
    setAuthContext(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const { data, error } = await supabase.functions.invoke('widget-token', {
        method: 'POST',
        body: { action: 'validate', token },
      });

      if (error || !data?.valid) {
        setAuthContext({
          isValid: false,
          isLoading: false,
          error: data?.error || 'Invalid token',
          userId: null,
          appId: null,
          conversationId: null,
          scopes: [],
          expiresAt: null,
        });
        return false;
      }

      setCurrentToken(token);
      setAuthContext({
        isValid: true,
        isLoading: false,
        error: null,
        userId: data.user_id,
        appId: data.app_id,
        conversationId: data.conversation_id,
        scopes: data.scopes || [],
        expiresAt: data.expires_at,
      });
      return true;
    } catch (err) {
      setAuthContext({
        isValid: false,
        isLoading: false,
        error: 'Failed to validate token',
        userId: null,
        appId: null,
        conversationId: null,
        scopes: [],
        expiresAt: null,
      });
      return false;
    }
  }, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!currentToken) return null;

    try {
      const { data, error } = await supabase.functions.invoke('widget-token', {
        method: 'POST',
        body: { action: 'refresh', token: currentToken },
      });

      if (error || !data?.token) {
        return null;
      }

      setCurrentToken(data.token);
      setAuthContext(prev => ({
        ...prev,
        expiresAt: data.expires_at,
      }));
      return data.token;
    } catch {
      return null;
    }
  }, [currentToken]);

  const hasScope = useCallback((scope: string): boolean => {
    return authContext.scopes.includes(scope);
  }, [authContext.scopes]);

  // Auto-validate on mount if token provided
  useEffect(() => {
    if (initialToken) {
      validateToken(initialToken);
    }
  }, [initialToken, validateToken]);

  // Auto-refresh before expiry
  useEffect(() => {
    if (!authContext.isValid || !authContext.expiresAt) return;

    const expiresAt = new Date(authContext.expiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    
    // Refresh 2 minutes before expiry
    const refreshIn = Math.max(0, timeUntilExpiry - 2 * 60 * 1000);
    
    if (refreshIn > 0) {
      const timer = setTimeout(() => {
        refreshToken();
      }, refreshIn);
      return () => clearTimeout(timer);
    }
  }, [authContext.isValid, authContext.expiresAt, refreshToken]);

  return {
    ...authContext,
    validateToken,
    refreshToken,
    hasScope,
  };
}
