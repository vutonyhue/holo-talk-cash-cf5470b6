/**
 * AI API Module
 * Endpoints for AI chat and image generation
 */

import { ApiClient } from '../apiClient';
import { API_BASE_URL } from '@/config/workerUrls';

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIChatRequest {
  messages: AIChatMessage[];
}

export interface AIImageRequest {
  prompt: string;
  sourceImageUrl?: string;
}

export interface AIImageResponse {
  text: string;
  imageUrl: string;
}

export function createAIApi(client: ApiClient) {
  return {
    /**
     * Stream AI chat response
     * Returns a ReadableStream for SSE consumption
     */
    async chat(messages: AIChatMessage[], accessToken: string): Promise<Response> {
      const response = await fetch(`${API_BASE_URL}/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error: ${response.status}`);
      }

      return response;
    },

    /**
     * Generate or edit an image
     */
    async generateImage(prompt: string, sourceImageUrl?: string, accessToken?: string): Promise<AIImageResponse> {
      const response = await fetch(`${API_BASE_URL}/v1/ai/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
        },
        body: JSON.stringify({ prompt, sourceImageUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error: ${response.status}`);
      }

      return response.json();
    },
  };
}
