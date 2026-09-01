// Shared types and utilities for Sea Scyte (Phase 1 + 2)

export type ContentType = 'film' | 'tv_episode' | 'tv_series' | 'track' | 'album' | 'documentary';

export type MembershipTier = 'basic' | 'pro' | 'vip';

export type UploadStatus = 'pending' | 'uploading' | 'processing' | 'ready' | 'failed';

export type WalletTxType =
  | 'purchase'
  | 'royalty_payout'
  | 'refund'
  | 'transfer_in'
  | 'transfer_out'
  | 'deposit'
  | 'withdrawal'
  | 'adjustment';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role: 'user' | 'creator' | 'admin';
  stripeCustomerId?: string;
}

export interface DeviceBinding {
  id: string;
  deviceId: string;
  label?: string;
  isRevoked: boolean;
  lastUsedAt?: string;
}

export interface ContentAsset {
  id: string;
  type: ContentType;
  title: string;
  slug?: string;
  status: 'draft' | 'pending_review' | 'published' | 'archived';
  metadata: Record<string, unknown>;
}

export interface LicensingTerms {
  contentId: string;
  syncAvailable: boolean;
  commercialUse: boolean;
  adSyncRights: boolean;
  territories: string[];
  exclusivity?: 'exclusive' | 'non_exclusive' | 'windowed';
  startDate?: string;
  endDate?: string;
}

export interface DistributionUpload {
  id: string;
  contentId?: string;
  originalFilename: string;
  status: UploadStatus;
  storageKey?: string;
  createdAt: string;
}

export interface WalletAccount {
  id: string;
  balanceCents: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: WalletTxType;
  amountCents: number;
  balanceAfter: number;
  sourceRef?: string;
  description?: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  tier: MembershipTier;
  isActive: boolean;
  startsAt: string;
  endsAt?: string;
}

export interface Entitlement {
  featureKey: string;
  grantedBy?: string;
  expiresAt?: string;
}
