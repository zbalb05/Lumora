import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ConfettiBurst } from '@/components/confetti-burst';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, MaxContentWidth, Spacing, TabBarHeight } from '@/constants/theme';
import { listRecentActivity, logActivity } from '@/db/queries/activity';
import { countDueFlashcards } from '@/db/queries/flashcards';
import { addGoal, completeGoal, deleteGoal, getGoalsForDate, getTodayGoals } from '@/db/queries/goals';
import type { activityLog, goals } from '@/db/schema';
import { useSuccessChime } from '@/hooks/use-success-chime';
import { useTheme } from '@/hooks/use-theme';
import { pullRemoteChanges, pushPendingChanges } from '@/services/sync';
import { computeStreak, getMonthGrid, toDateKey } from '@/utils/calendar';

type GoalRow = typeof goals.$inferSelect;
type ActivityRow = typeof activityLog.$inferSelect;

const CHART_DAY_OPTIONS = [7, 14, 30, 90] as const;
const DEFAULT_CHART_DAYS = 14;
const ACTIVITY_HISTORY_DAYS = 370;

export default function ProgressScreen() {
  const theme = useTheme();
  const playChime = useSuccessChime();
  const [todayGoals, setTodayGoals] = useState<GoalRow[]>([]);
  const [goalInput, setGoalInput] = useState('');
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<GoalRow[] | undefined>(undefined);
  const [chartDaysCount, setChartDaysCount] = useState<number>(DEFAULT_CHART_DAYS);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const [g, a, due] = await Promise.all([
      getTodayGoals(),
      listRecentActivity(ACTIVITY_HISTORY_DAYS),
      countDueFlashcards(),
    ]);
    setTodayGoals(g);
    setActivity(a);
    setDueFlashcards(due);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await pushPendingChanges();
    await pullRemoteChanges();
    await refresh();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    getGoalsForDate(selectedDate).then((rows) => {
      if (!cancelled) setSelectedGoals(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const activeDates = useMemo(() => new Set(activity.map((a) => a.date)), [activity]);
  const streak = useMemo(() => computeStreak(activeDates), [activeDates]);

  const chartDays = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (chartDaysCount - 1));
    for (let i = 0; i < chartDaysCount; i++) {
      const key = toDateKey(cursor);
      days.push({ date: key, count: activity.filter((a) => a.date === key).length });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [activity, chartDaysCount]);
  const maxCount = Math.max(1, ...chartDays.map((d) => d.count));

  const today = new Date();
  const monthWeeks = getMonthGrid(visibleMonth.year, visibleMonth.month);
  const todayKey = toDateKey(today);
  const monthLabel = new Date(visibleMonth.year, visibleMonth.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const goToPreviousMonth = () => {
    setSelectedDate(null);
    setVisibleMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    );
  };

  const goToNextMonth = () => {
    setSelectedDate(null);
    setVisibleMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    );
  };

  const handleAddGoal = async () => {
    const title = goalInput.trim();
    if (!title) return;
    try {
      const created = await addGoal(title);
      setTodayGoals((prev) => [...prev, created]);
      setGoalInput('');
    } catch (error) {
      Alert.alert('Could not save goal', error instanceof Error ? error.message : 'Unknown error.');
    }
  };

  const handleComplete = async (goal: GoalRow) => {
    await completeGoal(goal.id);
    await logActivity('goal_completed', { goalId: goal.id, title: goal.title });
    setTodayGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, completed: true } : g)));
    playChime();
    setShowBurst(true);
    setTimeout(() => setShowBurst(false), 900);
    refresh();
  };

  const handleDeleteGoal = async (goal: GoalRow) => {
    await deleteGoal(goal.id);
    setTodayGoals((prev) => prev.filter((g) => g.id !== goal.id));
  };

  return (
    <ThemedView style={styles.container}>
      {showBurst && <ConfettiBurst />}
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Brand.accent}
                colors={[Brand.accent]}
              />
            }>
            <ThemedText type="subtitle">Progress</ThemedText>

          <ThemedView type="backgroundElement" style={styles.goalCard}>
            <ThemedText type="smallBold">Today’s goals</ThemedText>
            {todayGoals.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                No goals yet — add one below.
              </ThemedText>
            )}
            {todayGoals.map((g) => (
              <View key={g.id} style={styles.goalItemRow}>
                <ThemedText
                  style={[styles.goalItemTitle, g.completed && styles.goalItemDone]}
                  themeColor={g.completed ? 'textSecondary' : 'text'}>
                  {g.title}
                </ThemedText>
                {!g.completed && (
                  <AnimatedPressable onPress={() => handleComplete(g)} hitSlop={8}>
                    <View style={[styles.goalItemButton, styles.goalItemButtonPrimary]}>
                      <ThemedText type="small" style={styles.primaryLabel}>
                        Done
                      </ThemedText>
                    </View>
                  </AnimatedPressable>
                )}
                <AnimatedPressable onPress={() => handleDeleteGoal(g)} hitSlop={8}>
                  <ThemedText type="small" style={styles.deleteLabel}>
                    Delete
                  </ThemedText>
                </AnimatedPressable>
              </View>
            ))}
            <View style={styles.goalRow}>
              <TextInput
                value={goalInput}
                onChangeText={setGoalInput}
                placeholder="e.g. Review 20 flashcards"
                placeholderTextColor={theme.textSecondary}
                style={[styles.goalInput, { color: theme.text }]}
                returnKeyType="done"
                onSubmitEditing={handleAddGoal}
              />
              <AnimatedPressable onPress={handleAddGoal}>
                <View style={[styles.goalButton, styles.goalButtonPrimary]}>
                  <ThemedText type="smallBold" style={styles.primaryLabel}>
                    Add
                  </ThemedText>
                </View>
              </AnimatedPressable>
            </View>
          </ThemedView>

          <View style={styles.statRow}>
            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="title" style={styles.statNumber}>
                {streak}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                day streak
              </ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="title" style={styles.statNumber}>
                {dueFlashcards}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                cards due
              </ThemedText>
            </ThemedView>
          </View>

          <View style={styles.section}>
            <View style={styles.chartHeader}>
              <ThemedText type="smallBold">Last {chartDaysCount} days</ThemedText>
              <View style={styles.chartRangeRow}>
                {CHART_DAY_OPTIONS.map((n) => (
                  <AnimatedPressable key={n} onPress={() => setChartDaysCount(n)}>
                    <ThemedView
                      type={chartDaysCount === n ? 'backgroundSelected' : 'backgroundElement'}
                      style={styles.chartRangeChip}>
                      <ThemedText type="small">{n}d</ThemedText>
                    </ThemedView>
                  </AnimatedPressable>
                ))}
              </View>
            </View>
            <View style={styles.chart}>
              {chartDays.map((d) => (
                <View key={d.date} style={styles.chartBarWrapper}>
                  <View
                    style={[
                      styles.chartBar,
                      {
                        height: Math.max(4, (d.count / maxCount) * 64),
                        backgroundColor: theme.backgroundSelected,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.calendarHeader}>
              <AnimatedPressable onPress={goToPreviousMonth} hitSlop={12}>
                <ThemedView type="backgroundElement" style={styles.calendarNavButton}>
                  <ThemedText type="smallBold">‹</ThemedText>
                </ThemedView>
              </AnimatedPressable>
              <ThemedText type="smallBold">{monthLabel}</ThemedText>
              <AnimatedPressable onPress={goToNextMonth} hitSlop={12}>
                <ThemedView type="backgroundElement" style={styles.calendarNavButton}>
                  <ThemedText type="smallBold">›</ThemedText>
                </ThemedView>
              </AnimatedPressable>
            </View>
            <View style={styles.calendar}>
              {monthWeeks.map((week, wi) => (
                <View key={wi} style={styles.calendarRow}>
                  {week.map((date, di) => {
                    if (!date) return <View key={di} style={styles.calendarCell} />;
                    const key = toDateKey(date);
                    const active = activeDates.has(key);
                    const isToday = key === todayKey;
                    const isSelected = key === selectedDate;
                    return (
                      <View key={di} style={styles.calendarCell}>
                        <AnimatedPressable
                          style={styles.calendarDayPressable}
                          onPress={() => {
                            setSelectedGoals(undefined);
                            setSelectedDate(key);
                          }}>
                          <ThemedView
                            type={active ? 'backgroundSelected' : 'backgroundElement'}
                            style={[
                              styles.calendarDay,
                              isToday && { backgroundColor: theme.text },
                              isSelected && { borderWidth: 2, borderColor: theme.text },
                            ]}>
                            <ThemedText type="small" style={isToday && { color: theme.background }}>
                              {date.getDate()}
                            </ThemedText>
                          </ThemedView>
                        </AnimatedPressable>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            {selectedDate && (
              <ThemedView type="backgroundElement" style={styles.dayDetail}>
                <ThemedText type="small" themeColor="textSecondary">
                  {new Date(selectedDate).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </ThemedText>
                {selectedGoals === undefined ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Loading…
                  </ThemedText>
                ) : selectedGoals.length > 0 ? (
                  selectedGoals.map((g) => (
                    <View key={g.id} style={styles.dayDetailGoalRow}>
                      <ThemedText type="smallBold" style={styles.goalItemTitle}>
                        {g.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {g.completed ? 'Completed' : 'Not completed'}
                      </ThemedText>
                    </View>
                  ))
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No goals were set for this day.
                  </ThemedText>
                )}
              </ThemedView>
            )}
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  flex: {
    flex: 1,
  },
  scroll: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four + TabBarHeight,
    gap: Spacing.four,
  },
  goalCard: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  goalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  goalItemTitle: {
    flex: 1,
    flexShrink: 1,
  },
  goalItemDone: {
    textDecorationLine: 'line-through',
  },
  goalItemButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  goalItemButtonPrimary: {
    backgroundColor: Brand.success,
  },
  primaryLabel: {
    color: '#FFFFFF',
  },
  deleteLabel: {
    color: '#c0392b',
  },
  dayDetailGoalRow: {
    gap: Spacing.half,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  goalInput: {
    flex: 1,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  goalButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalButtonPrimary: {
    backgroundColor: Brand.accent,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  statCard: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.half,
  },
  statNumber: {
    fontSize: 28,
    lineHeight: 34,
  },
  section: {
    gap: Spacing.two,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chartRangeRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  chartRangeChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.three,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
    height: 72,
  },
  chartBarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderRadius: 4,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
  },
  calendar: {
    gap: Spacing.one,
  },
  calendarRow: {
    flexDirection: 'row',
  },
  calendarCell: {
    flex: 1,
    aspectRatio: 1,
    padding: 2,
  },
  calendarDayPressable: {
    flex: 1,
  },
  calendarDay: {
    flex: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDetail: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
});
