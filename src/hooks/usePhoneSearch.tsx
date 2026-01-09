import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

interface UsePhoneSearchReturn {
  searchByPhone: (phoneNumber: string) => Promise<Profile | null>;
  isSearching: boolean;
  error: string | null;
  clearError: () => void;
}

// Normalize phone number: remove spaces, dashes, and optionally country code
const normalizePhoneNumber = (phone: string): string => {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Remove leading + if present
  if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }
  
  // Remove common country codes (84 for Vietnam, etc.)
  if (normalized.startsWith('84') && normalized.length > 9) {
    normalized = '0' + normalized.slice(2);
  }
  
  return normalized;
};

export const usePhoneSearch = (): UsePhoneSearchReturn => {
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchByPhone = async (phoneNumber: string): Promise<Profile | null> => {
    setError(null);
    setIsSearching(true);

    try {
      const normalized = normalizePhoneNumber(phoneNumber);
      
      if (normalized.length < 9) {
        setError('Số điện thoại không hợp lệ');
        return null;
      }

      // Search with multiple formats
      const searchPatterns = [
        phoneNumber,
        normalized,
        `+84${normalized.slice(1)}`,
        `84${normalized.slice(1)}`,
        `0${normalized.slice(-9)}`,
      ];

      const { data, error: searchError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, phone_number')
        .or(searchPatterns.map(p => `phone_number.eq.${p}`).join(','))
        .limit(1)
        .single();

      if (searchError) {
        if (searchError.code === 'PGRST116') {
          setError('Không tìm thấy người dùng với số điện thoại này');
          return null;
        }
        throw searchError;
      }

      return data as Profile;
    } catch (err: any) {
      console.error('Phone search error:', err);
      setError(err.message || 'Lỗi khi tìm kiếm');
      return null;
    } finally {
      setIsSearching(false);
    }
  };

  const clearError = () => setError(null);

  return {
    searchByPhone,
    isSearching,
    error,
    clearError,
  };
};
