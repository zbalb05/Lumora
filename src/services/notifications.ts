import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/**
 * expo-notifications' remote-push auto-registration side effect fires the moment the module is
 * imported and throws in Expo Go (removed there since SDK 53). Lazy-load it, and only outside
 * Expo Go, so that import never happens on a device running the Expo Go client.
 */
async function loadNotifications() {
  if (isRunningInExpoGo()) return null;

  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  return Notifications;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Schedules (or reschedules) a daily reminder notification under the given id. */
export async function scheduleReminder(
  id: string,
  title: string,
  hour: number,
  minute: number
): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body: "Don't forget to check off your study goal for today." },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return true;
}

export async function cancelReminder(id: string) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;

  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
