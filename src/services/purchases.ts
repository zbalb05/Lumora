import Purchases, { LOG_LEVEL, type CustomerInfo } from 'react-native-purchases';

// Android only for now — this project isn't testing on iOS yet, and RevenueCat requires a
// separate API key per store.
const androidApiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const purchasesConfigError = !androidApiKey
  ? 'Missing EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY — set it once the RevenueCat project and Play Console subscription products exist.'
  : null;

// Must match the entitlement identifier created in the RevenueCat dashboard (attached to both
// the monthly and annual products) — this is the single source of truth the paywall gate checks.
export const ENTITLEMENT_ID = 'pro';

let configured = false;

/** Idempotent — safe to call from multiple effects without double-initializing the SDK. */
export function configurePurchases() {
  if (configured || !androidApiKey) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: androidApiKey });
  configured = true;
}

export function hasActiveEntitlement(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}
