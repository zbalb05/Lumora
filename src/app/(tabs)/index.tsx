import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BadgeColors, Brand, MaxContentWidth, Radius, Spacing, TabBarHeight } from '@/constants/theme';
import { listRecentActivity } from '@/db/queries/activity';
import { countDueFlashcards, listFlashcardsByDocument } from '@/db/queries/flashcards';
import { listAllDocuments } from '@/db/queries/documents';
import type { documents } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { pullRemoteChanges, pushPendingChanges } from '@/services/sync';
import { computeStreak } from '@/utils/calendar';
import { sourceTypeIcon } from '@/utils/document-icon';

type DocumentRow = typeof documents.$inferSelect;

const QUICK_ACTIONS = [
  {
    icon: '📄',
    label: 'Upload',
    badge: BadgeColors.purple,
    href: { pathname: '/library' as const },
  },
  {
    icon: '📷',
    label: 'Camera',
    badge: BadgeColors.purple,
    href: { pathname: '/library' as const, params: { action: 'camera' } },
  },
  { icon: '🎙️', label: 'Record', badge: BadgeColors.purple, href: { pathname: '/record-lecture' as const } },
  { icon: '💬', label: 'Ask AI', badge: BadgeColors.purple, href: { pathname: '/chat' as const } },
];

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [recentDocuments, setRecentDocuments] = useState<DocumentRow[]>([]);
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const [streak, setStreak] = useState(0);
  const [weekActivity, setWeekActivity] = useState(0);
  const [continueDoc, setContinueDoc] = useState<{ doc: DocumentRow; progress: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [docs, due, allActivity, weekLogs] = await Promise.all([
      listAllDocuments(),
      countDueFlashcards(),
      listRecentActivity(370),
      listRecentActivity(7),
    ]);
    setRecentDocuments(docs.slice(0, 5));
    setDueFlashcards(due);
    setStreak(computeStreak(new Set(allActivity.map((a) => a.date))));
    setWeekActivity(weekLogs.length);

    const readyDoc = docs.find((d) => d.status === 'ready');
    if (readyDoc) {
      const cards = await listFlashcardsByDocument(readyDoc.id);
      setContinueDoc(
        cards.length > 0
          ? { doc: readyDoc, progress: cards.filter((c) => c.lastReviewedAt !== null).length / cards.length }
          : null
      );
    } else {
      setContinueDoc(null);
    }
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await pushPendingChanges();
    await pullRemoteChanges();
    await loadData();
    setRefreshing(false);
  };

  const hasLibrary = recentDocuments.length > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {loaded && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Brand.accent} colors={[Brand.accent]} />
            }>
            <LinearGradient colors={Brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
              <View style={styles.headerRow}>
                <View style={styles.headerTextBlock}>
                  <ThemedText type="small" style={styles.headerKicker}>
                    Ready to learn?
                  </ThemedText>
                  <ThemedText type="subtitle" style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
                    Hello there! 👋
                  </ThemedText>
                </View>
                <View style={styles.headerActions}>
                  <View style={styles.streakBadge}>
                    <ThemedText style={styles.streakEmoji}>🔥</ThemedText>
                    <ThemedText type="smallBold" style={styles.streakCount}>
                      {streak}
                    </ThemedText>
                  </View>
                </View>
              </View>

              <View style={[styles.quickActionsCard, { backgroundColor: theme.backgroundElement }]}>
                {QUICK_ACTIONS.map((action, i) => (
                  <View key={action.label} style={styles.quickActionWrap}>
                    {i > 0 && <View style={styles.quickActionDivider} />}
                    <AnimatedPressable style={styles.quickAction} onPress={() => router.push(action.href)}>
                      <View style={[styles.quickActionIcon, { backgroundColor: action.badge.bg }]}>
                        <ThemedText style={styles.quickActionEmoji}>{action.icon}</ThemedText>
                      </View>
                      <ThemedText type="small" numberOfLines={1}>
                        {action.label}
                      </ThemedText>
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
            </LinearGradient>

            {!hasLibrary && (
              <View style={styles.section}>
                <ThemedText type="subtitle">Your all-in-one study hub</ThemedText>
                <ThemedText themeColor="textSecondary">
                  Upload your course material and let Lumora turn it into notes, flashcards, and
                  quizzes.
                </ThemedText>
              </View>
            )}

            {continueDoc && (
              <AnimatedPressable
                onPress={() =>
                  router.push({ pathname: '/document/[id]', params: { id: continueDoc.doc.id } })
                }>
                <ThemedView type="backgroundElement" style={styles.continueCard}>
                  <View style={styles.progressRing}>
                    <ThemedText type="smallBold">{Math.round(continueDoc.progress * 100)}%</ThemedText>
                  </View>
                  <View style={styles.continueText}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {continueDoc.doc.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Continue reviewing this study set
                    </ThemedText>
                  </View>
                  <ThemedText type="subtitle" themeColor="textSecondary">
                    ›
                  </ThemedText>
                </ThemedView>
              </AnimatedPressable>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <ThemedText type="smallBold">Your learning at a glance</ThemedText>
              </View>
              <View style={styles.statGrid}>
                <StatTile icon="🔥" label="Day streak" value={String(streak)} badge={BadgeColors.amber} />
                <StatTile icon="🗂️" label="Due flashcards" value={String(dueFlashcards)} badge={BadgeColors.blue} />
                <StatTile
                  icon="📚"
                  label="Documents"
                  value={String(recentDocuments.length)}
                  badge={BadgeColors.purple}
                />
                <StatTile icon="✅" label="Active this week" value={String(weekActivity)} badge={BadgeColors.green} />
              </View>
            </View>

            {hasLibrary && (
              <View style={styles.section}>
                <ThemedText type="smallBold">Recently imported</ThemedText>
                {recentDocuments.map((doc, index) => (
                  <Animated.View key={doc.id} entering={FadeInDown.duration(300).delay(index * 40)}>
                    <AnimatedPressable
                      onPress={() => router.push({ pathname: '/document/[id]', params: { id: doc.id } })}>
                      <ThemedView type="backgroundElement" style={styles.docRow}>
                        <View style={[styles.docIconBadge, { backgroundColor: BadgeColors.purple.bg }]}>
                          <ThemedText style={styles.docIcon}>{sourceTypeIcon(doc.sourceType)}</ThemedText>
                        </View>
                        <ThemedText numberOfLines={1} style={styles.docTitle}>
                          {doc.title}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.docStatus}>
                          {doc.status}
                        </ThemedText>
                      </ThemedView>
                    </AnimatedPressable>
                  </Animated.View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function StatTile({
  icon,
  label,
  value,
  badge,
}: {
  icon: string;
  label: string;
  value: string;
  badge: { bg: string; fg: string };
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: badge.bg }]}>
        <ThemedText style={styles.statEmoji}>{icon}</ThemedText>
      </View>
      <ThemedText type="smallBold">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    borderRadius: Radius.card,
    gap: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerKicker: {
    color: '#F3E8FF',
  },
  headerTitle: {
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 0,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: '#FFFFFF33',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  streakEmoji: {
    fontSize: 16,
  },
  streakCount: {
    color: '#FFFFFF',
  },
  quickActionsCard: {
    flexDirection: 'row',
    borderRadius: Radius.card,
    paddingVertical: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 6,
  },
  quickActionWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  quickActionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#80808033',
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionEmoji: {
    fontSize: 20,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: TabBarHeight + Spacing.three,
    gap: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  section: {
    gap: Spacing.three,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  progressRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 4,
    borderColor: Brand.accentSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    flex: 1,
    gap: Spacing.half,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statTile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.half,
  },
  statEmoji: {
    fontSize: 16,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  docIconBadge: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIcon: {
    fontSize: 16,
  },
  docTitle: {
    flex: 1,
    flexShrink: 1,
  },
  docStatus: {
    flexShrink: 0,
  },
});
