// Gumpa — fetches the Store's item catalog (GET /store/catalog, backed by
// server/src/store.ts's STORE_CATALOG). Named store-catalog rather than
// "store" to avoid colliding with src/lib/store.ts, the unrelated zustand
// game-state store.

import { apiFetch } from '@/lib/api';

export interface StoreCatalogItem {
  id: string;
  name: string;
  description: string;
}

export type StoreCatalogResult = { status: 'ok'; items: StoreCatalogItem[] } | { status: 'error' };

export async function fetchStoreCatalog(token: string): Promise<StoreCatalogResult> {
  try {
    const res = await apiFetch('/store/catalog', { token });
    if (!res.ok) return { status: 'error' };
    const data = (await res.json()) as { items?: StoreCatalogItem[] };
    return { status: 'ok', items: data.items ?? [] };
  } catch {
    return { status: 'error' };
  }
}
