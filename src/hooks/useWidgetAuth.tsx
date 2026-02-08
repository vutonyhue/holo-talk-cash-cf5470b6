/**
 * Widget Authentication Hook
 * Handles token validation and user context for embedded widgets
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/config/workerUrls';

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

type ValidateOk = {
  ok: true;
  data: {
    valid: true;
    user_id: string;
    app_id: string;
    conversation_id: string | null;
    scopes: string[];
    expires_at: string;
  };
};

type ValidateErr = {
  ok: false;
  error?: { message?: string };
};

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
      const res = await fetch(`${API_BASE_URL}/v1/widget/token/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => null)) as (ValidateOk | ValidateErr | null);

      if (!json || (json as ValidateOk).ok !== true || !(json as ValidateOk).data?.valid) {
        setAuthContext({
          isValid: false,
          isLoading: false,
          error: (json as ValidateErr | null)?.error?.message || 'Invalid token',
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
        userId: (json as ValidateOk).data.user_id,
        appId: (json as ValidateOk).data.app_id,
        conversationId: (json as ValidateOk).data.conversation_id,
        scopes: (json as ValidateOk).data.scopes || [],
        expiresAt: (json as ValidateOk).data.expires_at,
      });
      return true;
    } catch (err) {
      if (import.meta.env.DEV) console.error('[useWidgetAuth] validateToken error:', err);
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

    // The current backend doesn't provide a refresh flow for widget tokens.
    // Best-effort: re-validate; if still valid, keep using the same token.
    const ok = await validateToken(currentToken);
    return ok ? currentToken : null;
  }, [currentToken, validateToken]);

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
