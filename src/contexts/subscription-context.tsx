import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

import { useAuth } from '@/contexts/auth-context';
import { configurePurchases, hasActiveEntitlement, purchasesConfigError } from '@/services/purchases';

export type SubscriptionStatus = 'loading' | 'subscribed' | 'unsubscribed';

const SubscriptionContext = createContext<{
  status: SubscriptionStatus;
  offerings: PurchasesOfferings | null;
  error: string | null;
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
}>({
  status: 'loading',
  offerings: null,
  error: null,
  purchase: async () => false,
  restore: async () => false,
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus>('loading');
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [error, setError] = useState<string | null>(purchasesConfigError);

  // Subscription state is tied to the signed-in Supabase user (via RevenueCat's appUserID), not
  // the device — logging in re-identifies RevenueCat's customer record on every sign-in so the
  // same subscription follows the user across devices.
  useEffect(() => {
    if (purchasesConfigError) return;
    if (!user) {
      setStatus('loading');
      return;
    }

    let cancelled = false;
    configurePurchases();

    const applyInfo = (info: CustomerInfo) => {
      if (cancelled) return;
      setStatus(hasActiveEntitlement(info) ? 'subscribed' : 'unsubscribed');
    };

    Purchases.logIn(user.id)
      .then(({ customerInfo }) => applyInfo(customerInfo))
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load subscription status.');
        }
      });

    Purchases.getOfferings()
      .then((result) => {
        if (!cancelled) setOfferings(result);
      })
      .catch(() => {});

    Purchases.addCustomerInfoUpdateListener(applyInfo);

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(applyInfo);
    };
  }, [user]);

  const purchase = async (pkg: PurchasesPackage) => {
    setError(null);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const active = hasActiveEntitlement(customerInfo);
      setStatus(active ? 'subscribed' : 'unsubscribed');
      return active;
    } catch (err) {
      const userCancelled = (err as { userCancelled?: boolean | null } | null)?.userCancelled;
      if (!userCancelled) {
        setError(err instanceof Error ? err.message : 'Purchase failed.');
      }
      return false;
    }
  };

  const restore = async () => {
    setError(null);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const active = hasActiveEntitlement(customerInfo);
      setStatus(active ? 'subscribed' : 'unsubscribed');
      return active;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore purchases.');
      return false;
    }
  };

  return (
    <SubscriptionContext.Provider value={{ status, offerings, error, purchase, restore }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
