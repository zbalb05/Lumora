import { isRunningInExpoGo } from 'expo';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing, MaxContentWidth } from '@/constants/theme';
import { type ThemePreference, useThemePreference } from '@/contexts/theme-preference';
import { clearAllData } from '@/db/queries/reset';
import { createReminder, deleteReminder, listReminders, updateReminder } from '@/db/queries/reminders';
import type { reminders } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { cancelReminder, scheduleReminder } from '@/services/notifications';
import { pullRemoteChanges, pushPendingChanges } from '@/services/sync';

const APP_VERSION = '1.0.0';
const hasGeminiKey = Boolean(process.env.EXPO_PUBLIC_GEMINI_API_KEY);
const DEFAULT_HOUR = 18;
const DEFAULT_MINUTE = 0;
const MINUTE_STEP = 15;

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type ReminderRow = typeof reminders.$inferSelect;

function formatTime(hour: number, minute: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function clampTime(hour: number, minute: number, deltaHour: number, deltaMinute: number) {
  let totalMinutes = hour * 60 + minute + deltaHour * 60 + deltaMinute;
  totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 };
}

function TimeStepper({
  hour,
  minute,
  onAdjust,
}: {
  hour: number;
  minute: number;
  onAdjust: (deltaHour: number, deltaMinute: number) => void;
}) {
  return (
    <View style={styles.timeStepper}>
      <AnimatedPressable onPress={() => onAdjust(-1, 0)} hitSlop={8}>
        <ThemedView type="background" style={styles.stepperButton}>
          <ThemedText type="smallBold">«</ThemedText>
        </ThemedView>
      </AnimatedPressable>
      <AnimatedPressable onPress={() => onAdjust(0, -MINUTE_STEP)} hitSlop={8}>
        <ThemedView type="background" style={styles.stepperButton}>
          <ThemedText type="smallBold">‹</ThemedText>
        </ThemedView>
      </AnimatedPressable>
      <ThemedText type="smallBold" style={styles.timeLabel}>
        {formatTime(hour, minute)}
      </ThemedText>
      <AnimatedPressable onPress={() => onAdjust(0, MINUTE_STEP)} hitSlop={8}>
        <ThemedView type="background" style={styles.stepperButton}>
          <ThemedText type="smallBold">›</ThemedText>
        </ThemedView>
      </AnimatedPressable>
      <AnimatedPressable onPress={() => onAdjust(1, 0)} hitSlop={8}>
        <ThemedView type="background" style={styles.stepperButton}>
          <ThemedText type="smallBold">»</ThemedText>
        </ThemedView>
      </AnimatedPressable>
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const [reminderList, setReminderList] = useState<ReminderRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newHour, setNewHour] = useState(DEFAULT_HOUR);
  const [newMinute, setNewMinute] = useState(DEFAULT_MINUTE);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadReminders = useCallback(async () => {
    const rows = await listReminders();
    setReminderList(rows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await pushPendingChanges();
    await pullRemoteChanges();
    await loadReminders();
    setRefreshing(false);
  };

  const notificationsBlockedMessage = isRunningInExpoGo()
    ? 'Reminders need a development build — Expo Go no longer supports notifications.'
    : 'Enable notifications for Lumora in your device settings to get reminders.';

  const handleToggleReminder = async (reminder: ReminderRow, next: boolean) => {
    if (next) {
      const granted = await scheduleReminder(reminder.id, reminder.title, reminder.hour, reminder.minute);
      if (!granted) {
        Alert.alert('Notifications disabled', notificationsBlockedMessage);
        return;
      }
    } else {
      await cancelReminder(reminder.id);
    }
    await updateReminder(reminder.id, { enabled: next });
    setReminderList((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, enabled: next } : r)));
  };

  const handleAdjustReminderTime = async (reminder: ReminderRow, deltaHour: number, deltaMinute: number) => {
    const { hour, minute } = clampTime(reminder.hour, reminder.minute, deltaHour, deltaMinute);
    setReminderList((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, hour, minute } : r)));
    await updateReminder(reminder.id, { hour, minute });
    if (reminder.enabled) {
      await scheduleReminder(reminder.id, reminder.title, hour, minute);
    }
  };

  const handleDeleteReminder = (reminder: ReminderRow) => {
    Alert.alert('Delete this reminder?', `"${reminder.title}" will no longer notify you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await cancelReminder(reminder.id);
          await deleteReminder(reminder.id);
          setReminderList((prev) => prev.filter((r) => r.id !== reminder.id));
        },
      },
    ]);
  };

  const handleAddReminder = async () => {
    const title = newTitle.trim() || 'Study reminder';
    const row = await createReminder(title, newHour, newMinute);
    const granted = await scheduleReminder(row.id, title, newHour, newMinute);
    if (!granted) {
      await updateReminder(row.id, { enabled: false });
      Alert.alert('Notifications disabled', notificationsBlockedMessage);
    }
    setReminderList((prev) => [...prev, { ...row, enabled: granted }].sort((a, b) =>
      a.hour !== b.hour ? a.hour - b.hour : a.minute - b.minute
    ));
    setNewTitle('');
    setNewHour(DEFAULT_HOUR);
    setNewMinute(DEFAULT_MINUTE);
    setAdding(false);
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear all data?',
      'This deletes every uploaded document, note, flashcard, quiz, goal, and activity log entry ' +
        'from this device. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear data',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Alert.alert('Done', 'All study data has been cleared.');
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Brand.accent}
              colors={[Brand.accent]}
            />
          }>
        <ThemedView type="backgroundElement" style={styles.row}>
          <ThemedText type="smallBold">Appearance</ThemedText>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((option) => (
              <AnimatedPressable
                key={option.value}
                style={styles.flex}
                onPress={() => setPreference(option.value)}>
                <ThemedView
                  type={preference === option.value ? 'backgroundSelected' : 'background'}
                  style={styles.themeChip}>
                  <ThemedText type="small">{option.label}</ThemedText>
                </ThemedView>
              </AnimatedPressable>
            ))}
          </View>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.row}>
          <ThemedText type="smallBold">Gemini API key</ThemedText>
          <ThemedText themeColor={hasGeminiKey ? 'text' : 'textSecondary'}>
            {hasGeminiKey ? 'Configured' : 'Not set — add EXPO_PUBLIC_GEMINI_API_KEY to .env'}
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.row}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <ThemedText type="smallBold">Reminders</ThemedText>
              <ThemedText themeColor="textSecondary">
                Custom notifications with their own title and time.
              </ThemedText>
            </View>
          </View>

          {loaded && reminderList.length === 0 && !adding && (
            <ThemedText type="small" themeColor="textSecondary">
              No reminders yet.
            </ThemedText>
          )}

          {reminderList.map((reminder) => (
            <ThemedView key={reminder.id} type="background" style={styles.reminderRow}>
              <View style={styles.switchRow}>
                <AnimatedPressable
                  style={styles.flex}
                  onPress={() => setEditingId((id) => (id === reminder.id ? null : reminder.id))}>
                  <View style={styles.switchLabel}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {reminder.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatTime(reminder.hour, reminder.minute)}
                    </ThemedText>
                  </View>
                </AnimatedPressable>
                <Switch
                  value={reminder.enabled}
                  onValueChange={(next) => handleToggleReminder(reminder, next)}
                  trackColor={{ true: Brand.accent }}
                />
                <AnimatedPressable onPress={() => handleDeleteReminder(reminder)} hitSlop={8}>
                  <ThemedText style={styles.deleteGlyph}>✕</ThemedText>
                </AnimatedPressable>
              </View>

              {editingId === reminder.id && (
                <TimeStepper
                  hour={reminder.hour}
                  minute={reminder.minute}
                  onAdjust={(dh, dm) => handleAdjustReminderTime(reminder, dh, dm)}
                />
              )}
            </ThemedView>
          ))}

          {adding ? (
            <View style={styles.addForm}>
              <ThemedView type="background" style={styles.titleInputWrap}>
                <TextInput
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="Study reminder"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.titleInput, { color: theme.text }]}
                />
              </ThemedView>
              <TimeStepper hour={newHour} minute={newMinute} onAdjust={(dh, dm) => {
                const { hour, minute } = clampTime(newHour, newMinute, dh, dm);
                setNewHour(hour);
                setNewMinute(minute);
              }} />
              <View style={styles.addFormActions}>
                <AnimatedPressable style={styles.flex} onPress={() => setAdding(false)}>
                  <ThemedView type="background" style={styles.formButton}>
                    <ThemedText type="smallBold">Cancel</ThemedText>
                  </ThemedView>
                </AnimatedPressable>
                <AnimatedPressable style={styles.flex} onPress={handleAddReminder}>
                  <View style={[styles.formButton, styles.formButtonPrimary]}>
                    <ThemedText type="smallBold" style={styles.formButtonPrimaryLabel}>
                      Add reminder
                    </ThemedText>
                  </View>
                </AnimatedPressable>
              </View>
            </View>
          ) : (
            <AnimatedPressable onPress={() => setAdding(true)}>
              <ThemedView type="background" style={styles.addButton}>
                <ThemedText type="smallBold">+ Add reminder</ThemedText>
              </ThemedView>
            </AnimatedPressable>
          )}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.row}>
          <ThemedText type="smallBold">Storage</ThemedText>
          <ThemedText themeColor="textSecondary">
            All study data is stored on this device for now.
          </ThemedText>
          <AnimatedPressable onPress={handleClearData}>
            <ThemedView type="background" style={styles.clearButton}>
              <ThemedText type="smallBold" style={styles.clearLabel}>
                Clear all data
              </ThemedText>
            </ThemedView>
          </AnimatedPressable>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.row}>
          <ThemedText type="smallBold">About</ThemedText>
          <ThemedText themeColor="textSecondary">Lumora {APP_VERSION}</ThemedText>
          <ThemedText themeColor="textSecondary">
            Upload your course material and let AI turn it into notes, flashcards, quizzes, and a
            tutor that knows your content.
          </ThemedText>
        </ThemedView>
        </ScrollView>
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
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  themeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  themeChip: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  switchLabel: {
    flex: 1,
    gap: Spacing.half,
  },
  reminderRow: {
    padding: Spacing.two,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  deleteGlyph: {
    color: '#c0392b',
    fontSize: 16,
    paddingHorizontal: Spacing.one,
  },
  timeStepper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.one,
  },
  stepperButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.three,
    alignItems: 'center',
    minWidth: 32,
  },
  timeLabel: {
    minWidth: 68,
    textAlign: 'center',
  },
  addButton: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  addForm: {
    gap: Spacing.two,
  },
  titleInputWrap: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  titleInput: {
    fontSize: 16,
  },
  addFormActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  formButton: {
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  formButtonPrimary: {
    backgroundColor: Brand.accent,
  },
  formButtonPrimaryLabel: {
    color: '#FFFFFF',
  },
  clearButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  clearLabel: {
    color: '#c0392b',
  },
});
