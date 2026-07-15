import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';

export async function getSetting(key: string) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value;
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
