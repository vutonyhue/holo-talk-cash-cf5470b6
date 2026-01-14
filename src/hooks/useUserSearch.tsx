import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

interface UseUserSearchReturn {
  searchUsers: (query: string) => Promise<Profile[]>;
  isSearching: boolean;
  error: string | null;
  clearError: () => void;
}

// Normalize phone number: remove spaces, dashes, and optionally country code
const normalizePhoneNumber = (phone: string): string => {
  let normalized = phone.replace(/[^\d+]/g, '');
  
  if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }
  
  // Remove common country codes (84 for Vietnam, etc.)
  if (normalized.startsWith('84') && normalized.length > 9) {
    normalized = '0' + normalized.slice(2);
  }
  
  return normalized;
};

export const useUserSearch = (): UseUserSearchReturn => {
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchUsers = async (query: string): Promise<Profile[]> => {
    setError(null);
    setIsSearching(true);

    try {
      const trimmedQuery = query.trim();
      
      if (trimmedQuery.length < 2) {
        return [];
      }

      const digitsOnly = trimmedQuery.replace(/\D/g, '');
      const isPhoneSearch = digitsOnly.length >= 9;

      if (isPhoneSearch) {
        // Search by phone number
        const normalized = normalizePhoneNumber(trimmedQuery);
        
        const searchPatterns = [
          trimmedQuery,
          normalized,
          `+84${normalized.slice(1)}`,
          `84${normalized.slice(1)}`,
          `0${normalized.slice(-9)}`,
        ];

        const { data, error: searchError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, phone_number')
          .or(searchPatterns.map(p => `phone_number.eq.${p}`).join(','))
          .limit(5);

        if (searchError) {
          throw searchError;
        }

        return (data as Profile[]) || [];
      } else {
        // Search by username or display_name (case-insensitive)
        const { data, error: searchError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, phone_number')
          .or(`username.ilike.%${trimmedQuery}%,display_name.ilike.%${trimmedQuery}%`)
          .limit(5);

        if (searchError) {
          throw searchError;
        }

        return (data as Profile[]) || [];
      }
    } catch (err: any) {
      console.error('User search error:', err);
      setError(err.message || 'Lỗi khi tìm kiếm');
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  const clearError = () => setError(null);

  return {
    searchUsers,
    isSearching,
    error,
    clearError,
  };
};
