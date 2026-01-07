import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ReferralCode {
  code: string;
  uses_count: number;
  max_uses: number;
  is_active: boolean;
  share_url: string;
}

export function useReferral() {
  const { user, session } = useAuth();
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getReferralCode = useCallback(async () => {
    if (!session?.access_token) return null;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('get-referral-code', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (fnError) {
        setError(fnError.message);
        return null;
      }

      if (data?.error) {
        setError(data.error);
        return null;
      }

      setReferralCode(data);
      return data;
    } catch (err) {
      console.error('Error getting referral code:', err);
      setError('Failed to get referral code');
      return null;
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const useReferralCode = useCallback(async (code: string) => {
    if (!session?.access_token) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke('use-referral-code', {
        body: { code },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (fnError) {
        return { success: false, error: fnError.message };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      return { success: true, referrer_username: data.referrer_username };
    } catch (err) {
      console.error('Error using referral code:', err);
      return { success: false, error: 'Failed to use referral code' };
    }
  }, [session?.access_token]);

  const copyToClipboard = useCallback(async () => {
    if (!referralCode?.code) return false;
    
    try {
      await navigator.clipboard.writeText(referralCode.code);
      return true;
    } catch {
      return false;
    }
  }, [referralCode?.code]);

  const shareReferral = useCallback(async () => {
    if (!referralCode?.share_url) return false;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FunChat - Mời bạn bè',
          text: `Tham gia FunChat cùng mình! Sử dụng mã giới thiệu: ${referralCode.code}`,
          url: referralCode.share_url
        });
        return true;
      } catch {
        // User cancelled or share failed
      }
    }

    // Fallback to copying link
    try {
      await navigator.clipboard.writeText(referralCode.share_url);
      return true;
    } catch {
      return false;
    }
  }, [referralCode]);

  // Fetch referral code when user is available
  useEffect(() => {
    if (user && session?.access_token) {
      getReferralCode();
    }
  }, [user, session?.access_token, getReferralCode]);

  return {
    referralCode,
    loading,
    error,
    getReferralCode,
    useReferralCode,
    copyToClipboard,
    shareReferral
  };
}
