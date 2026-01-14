import { useState } from 'react';
import { api } from '@/lib/api';

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

      // Use API client instead of direct Supabase call
      const response = await api.users.search(trimmedQuery);

      if (!response.ok) {
        throw new Error(response.error?.message || 'Search failed');
      }

      return (response.data?.users as Profile[]) || [];
    } catch (err: any) {
      console.error('[useUserSearch] Error:', err);
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
