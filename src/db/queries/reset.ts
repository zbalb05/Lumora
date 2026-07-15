import { db } from '@/db/client';
import { activityLog, goals, reminders, studySets, syncQueue, syncState } from '@/db/schema';
import { cancelReminder } from '@/services/notifications';

/**
 * Deletes every study set (cascading to its documents, notes, flashcards, quiz, and chat
 * history), plus goals and activity log entries — from this device's local cache only, matching
 * the Settings screen's "from this device" copy. Deliberately does NOT enqueue sync deletes: the
 * data still exists in the user's account in Supabase and pulls back down on the next sync.
 * Leaves app preferences (theme, reminder settings) untouched.
 */
export async function clearAllData() {
  await db.delete(studySets);
  await db.delete(goals);
  await db.delete(activityLog);
}

/**
 * Wipes the local cache on sign-out, so a different account signing in on this device never sees
 * the previous user's data. Unlike clearAllData(), this does NOT enqueue sync deletes — the data
 * still exists under the signed-out user's account in Supabase and pulls back down next sign-in.
 * Also cancels scheduled reminder notifications and clears the sync queue/watermarks themselves,
 * since both are meaningless once switching accounts.
 */
export async function clearLocalCacheOnSignOut() {
  const reminderRows = await db.select({ id: reminders.id }).from(reminders);
  await Promise.all(reminderRows.map((row) => cancelReminder(row.id)));

  await db.delete(studySets);
  await db.delete(goals);
  await db.delete(activityLog);
  await db.delete(reminders);
  await db.delete(syncQueue);
  await db.delete(syncState);
}
