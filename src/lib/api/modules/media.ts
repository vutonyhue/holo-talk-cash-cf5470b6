/**
 * Media API Module
 * Endpoints for file upload and media operations
 */

import { ApiClient } from '../apiClient';
import { ApiResponse, PresignedUrlRequest, PresignedUrlResponse } from '../types';

export function createMediaApi(client: ApiClient) {
  return {
    /**
     * Get a presigned URL for uploading a file
     */
    async getPresignedUrl(data: PresignedUrlRequest): Promise<ApiResponse<PresignedUrlResponse>> {
      return client.post<PresignedUrlResponse>('/v1/media/presign', data);
    },

    /**
     * Upload a file using the presigned URL
     * This is a direct upload to storage, not through the API
     */
    async uploadToPresignedUrl(presignedUrl: string, file: File | Blob): Promise<{ ok: boolean; error?: string }> {
      try {
        const response = await fetch(presignedUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (!response.ok) {
          return { ok: false, error: `Upload failed: ${response.statusText}` };
        }

        return { ok: true };
      } catch (error) {
        return { 
          ok: false, 
          error: error instanceof Error ? error.message : 'Upload failed' 
        };
      }
    },

    /**
     * Helper: Upload a file and get the public URL
     */
    async uploadFile(file: File, bucket = 'chat-attachments'): Promise<ApiResponse<{ publicUrl: string }>> {
      // Get presigned URL
      const presignResult = await this.getPresignedUrl({
        filename: file.name,
        contentType: file.type,
        bucket,
      });

      if (!presignResult.ok || !presignResult.data) {
        return {
          ok: false,
          error: presignResult.error || { code: 'PRESIGN_FAILED', message: 'Failed to get upload URL' },
        };
      }

      // Upload to presigned URL
      const uploadResult = await this.uploadToPresignedUrl(presignResult.data.uploadUrl, file);

      if (!uploadResult.ok) {
        return {
          ok: false,
          error: { code: 'UPLOAD_FAILED', message: uploadResult.error || 'Upload failed' },
        };
      }

      return {
        ok: true,
        data: { publicUrl: presignResult.data.publicUrl },
      };
    },

    /**
     * Helper: Upload an audio blob and get the public URL
     */
    async uploadAudio(audioBlob: Blob, duration: number, conversationId: string): Promise<ApiResponse<{ publicUrl: string; duration: number }>> {
      const filename = `voice_${Date.now()}.webm`;
      
      const presignResult = await this.getPresignedUrl({
        filename,
        contentType: 'audio/webm',
        bucket: 'chat-attachments',
      });

      if (!presignResult.ok || !presignResult.data) {
        return {
          ok: false,
          error: presignResult.error || { code: 'PRESIGN_FAILED', message: 'Failed to get upload URL' },
        };
      }

      const uploadResult = await this.uploadToPresignedUrl(presignResult.data.uploadUrl, audioBlob);

      if (!uploadResult.ok) {
        return {
          ok: false,
          error: { code: 'UPLOAD_FAILED', message: uploadResult.error || 'Upload failed' },
        };
      }

      return {
        ok: true,
        data: { 
          publicUrl: presignResult.data.publicUrl,
          duration,
        },
      };
    },
  };
}
