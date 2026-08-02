// Gumpa — hands a just-verified photo submission off from the challenge
// card to the review screen (src/app/submit-review.tsx). In-memory only
// (no AsyncStorage persistence): the photo/proof data is only ever needed
// for the single hop between those two screens, never across app restarts.

import { create } from 'zustand';

import type { Challenge } from '@/lib/data';

export interface PendingSubmission {
  challenge: Challenge;
  photoUri: string;
  photoBase64: string;
  mediaType: string;
  photoProof: string;
  hashThumbnailBase64?: string;
  lat?: number;
  lng?: number;
}

interface DraftSubmissionStore {
  pending: PendingSubmission | null;
  setPending: (pending: PendingSubmission) => void;
  clear: () => void;
}

export const useDraftSubmissionStore = create<DraftSubmissionStore>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
