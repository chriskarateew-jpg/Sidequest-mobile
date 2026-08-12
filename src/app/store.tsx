import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { BoltIcon } from '@/components/rail-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth';
import { fetchStoreCatalog, type StoreCatalogItem } from '@/lib/store-catalog';
import { useToastStore } from '@/lib/toast';

// The Store: one-time consumable purchases, real money, no Gumpa+ required
// (a deliberately separate revenue stream from the subscription — see
// docs/rewards-economy-plan.md). The backend side is real (server/src/store.ts,
// POST /webhooks/revenuecat already applies a purchase's effect the moment
// it arrives) — what's missing is react-native-purchases itself, same
// blocker as Gumpa+ (src/app/rewards.tsx), so buying here is a "coming
// soon" tap for now rather than a real charge.
export default function StoreScreen() {
  const token = useAuthStore((s) => s.token);
  const show = useToastStore((s) => s.show);
  const [items, setItems] = useState<StoreCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const result = await fetchStoreCatalog(token);
    if (result.status === 'ok') {
      setItems(result.items);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBuy = (item: StoreCatalogItem) => {
    show(`${item.name} is coming soon. Purchases go live once the Gumpa+ billing setup does.`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BackButton />
      <Text style={styles.pageTitle}>Store</Text>
      <Text style={styles.subtitle}>One-time boosts to spend real money on, no subscription needed.</Text>

      {loading && <ActivityIndicator color={Colors.accent} style={styles.spinner} />}
      {!loading && loadError && <Text style={styles.errorText}>Couldn't load the Store. Pull back and try again.</Text>}

      {!loading &&
        !loadError &&
        items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemIcon}>
              <BoltIcon size={22} color={Colors.accent} />
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemDesc}>{item.description}</Text>
            </View>
            <Pressable style={styles.buyButton} onPress={() => handleBuy(item)}>
              <Text style={styles.buyButtonText}>Buy</Text>
            </Pressable>
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  pageTitle: { fontSize: 26, fontWeight: '800', color: Colors.accent, marginBottom: Spacing.one, textAlign: 'center' },
  subtitle: { fontSize: 13, color: Colors.muted, textAlign: 'center', marginBottom: Spacing.four, lineHeight: 18 },
  spinner: { marginTop: Spacing.five },
  errorText: { color: Colors.muted, textAlign: 'center', marginTop: Spacing.five, fontSize: 13.5 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    gap: Spacing.three,
    ...Shadow,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  itemDesc: { fontSize: 12.5, color: Colors.muted, lineHeight: 17 },
  buyButton: {
    backgroundColor: Colors.accentSoft,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  buyButtonText: { fontWeight: '800', fontSize: 13, color: Colors.accent },
});
