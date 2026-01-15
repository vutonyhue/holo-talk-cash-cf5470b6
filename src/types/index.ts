export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  status: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  members?: ConversationMember[];
  last_message?: Message;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  message_type: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  sender?: Profile;
  reply_to_id?: string | null;
  reply_to?: Message;
  _sending?: boolean; // Flag đánh dấu tin nhắn đang gửi (optimistic update)
  _failed?: boolean; // Flag đánh dấu tin nhắn gửi thất bại
}

export interface CryptoTransaction {
  id: string;
  message_id: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  amount: number;
  currency: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

export interface Call {
  id: string;
  conversation_id: string;
  caller_id: string | null;
  call_type: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface CallParticipant {
  id: string;
  call_id: string;
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
}

export interface RewardTask {
  id: string;
  name_vi: string;
  name_en: string;
  description_vi: string;
  description_en: string;
  reward_amount: number;
  icon: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  requires_verification: boolean;
  max_claims: number;
  created_at: string;
}

export interface UserReward {
  id: string;
  user_id: string;
  task_id: string;
  status: 'pending' | 'completed' | 'claimed' | 'paid';
  progress: Record<string, any>;
  completed_at: string | null;
  claimed_at: string | null;
  paid_at: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
  task?: RewardTask;
}
