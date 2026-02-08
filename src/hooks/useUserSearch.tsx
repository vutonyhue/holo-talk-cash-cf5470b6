import { useState } from 'react';
import { api } from '@/lib/api';

interface UserSearchProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

interface UseUserSearchReturn {
  searchUsers: (query: string) => Promise<UserSearchProfile[]>;
  isSearching: boolean;
  error: string | null;
  clearError: () => void;
}

export const useUserSearch = (): UseUserSearchReturn => {
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchUsers = async (query: string): Promise<UserSearchProfile[]> => {
    setError(null);
    setIsSearching(true);

    try {
      const trimmedQuery = query.trim();

      if (trimmedQuery.length < 2) {
        return [];
      }

      const response = await api.users.search(trimmedQuery);

      if (!response.ok) {
        throw new Error(response.error?.message || 'Search failed');
      }

      return (response.data?.users as UserSearchProfile[]) || [];
    } catch (err: unknown) {
      if (import.meta.env.DEV) {
        console.error('[useUserSearch] Error:', err);
      }
      const message = err instanceof Error ? err.message : 'Loi khi tim kiem';
      setError(message);
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