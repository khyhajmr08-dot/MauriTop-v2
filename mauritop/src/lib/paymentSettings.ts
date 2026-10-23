import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { cacheService } from "./cache";

export interface PaymentMethodConfig {
  id: "bankily" | "sadad" | string;
  label: string;
  labelAr: string;
  labelFr: string;
  phone: string;
  accountHolderAr: string;
  accountHolderFr: string;
  enabled: boolean;
  unavailableReasonAr?: string;
  unavailableReasonFr?: string;
  descAr?: string;
  descFr?: string;
}

export type PaymentSettingsMap = Record<string, PaymentMethodConfig>;

export const DEFAULT_PAYMENT_CONFIGS: PaymentSettingsMap = {
  bankily: {
    id: "bankily",
    label: "Bankily",
    labelAr: "بنكيلي",
    labelFr: "Bankily",
    // Merchant receiving number confirmed by the owner.
    phone: "32014902",
    accountHolderAr: "موري توب للاستلام",
    accountHolderFr: "MauriTop Réception",
    enabled: true,
    unavailableReasonAr: "رقم الاستلام التجاري غير مضبوط",
    unavailableReasonFr: "Actuellement indisponible",
    descAr: "الدفع الفوري السريع عبر تطبيق بنكيلي",
    descFr: "Transfert instantané via Bankily (BPM)"
  },
  sadad: {
    id: "sadad",
    label: "Sadad",
    labelAr: "سداد",
    labelFr: "Sedad",
    phone: "27329380",
    accountHolderAr: "موري توب للاستلام",
    accountHolderFr: "MauriTop Réception",
    enabled: true,
    unavailableReasonAr: "رقم الاستلام التجاري غير مضبوط",
    unavailableReasonFr: "Actuellement indisponible",
    descAr: "التحويل السريع والمباشر عبر سداد",
    descFr: "Transfert rapide via Sedad (BIM)"
  },
  paypal: {
    id: "paypal",
    label: "PayPal",
    labelAr: "PayPal",
    labelFr: "PayPal",
    phone: "",
    accountHolderAr: "",
    accountHolderFr: "",
    enabled: false,
    unavailableReasonAr: "قريباً — PayPal غير مفعّل بعد",
    unavailableReasonFr: "Bientôt disponible — PayPal n'est pas encore activé",
    descAr: "الدفع الدولي عبر PayPal — سيتوفر بعد إعداد الحساب والتحقق منه",
    descFr: "Paiement international — disponible après configuration et vérification"
  }
};

// Bump the key after removing unsafe hardcoded destination fallbacks so old cached defaults are ignored.
const CACHE_KEY = "system_payment_settings_v3";

/**
 * Normalizes payment methods map ensuring all standard keys exist
 */
export function normalizePaymentSettings(raw: any): PaymentSettingsMap {
  const result: PaymentSettingsMap = { ...DEFAULT_PAYMENT_CONFIGS };
  if (!raw || typeof raw !== "object") return result;

  const methods = raw.methods || raw;
  
  for (const key of Object.keys(DEFAULT_PAYMENT_CONFIGS)) {
    if (methods[key]) {
      result[key] = {
        ...DEFAULT_PAYMENT_CONFIGS[key],
        ...methods[key],
        id: key,
        enabled: typeof methods[key].enabled === "boolean" ? methods[key].enabled : DEFAULT_PAYMENT_CONFIGS[key].enabled,
        phone: (Object.prototype.hasOwnProperty.call(methods[key], "phone")
          ? String(methods[key].phone ?? "").trim()
          : methods[key].accountNumber
            ? String(methods[key].accountNumber).trim()
            : "") || DEFAULT_PAYMENT_CONFIGS[key].phone,
        // PayPal must remain unavailable until a real server-side payment integration exists.
        ...(key === "paypal" ? { enabled: false, phone: "" } : {}),
        unavailableReasonAr: methods[key].unavailableReasonAr || "غير متوفر حالياً",
        unavailableReasonFr: methods[key].unavailableReasonFr || "Actuellement indisponible"
      };
    }
  }

  // Only the explicitly supported methods are surfaced: Bankily, Sedad, and disabled PayPal.
  // Legacy methods remain stored for rollback compatibility but are not offered to customers.

  return result;
}

/**
 * Fetch payment settings once with caching
 */
export async function getPaymentSettings(force = false): Promise<PaymentSettingsMap> {
  if (!force) {
    const cached = cacheService.get<PaymentSettingsMap>(CACHE_KEY);
    if (cached) return cached;
  }

  try {
    const snap = await getDoc(doc(db, "settings", "payment_methods"));
    if (snap.exists()) {
      const normalized = normalizePaymentSettings(snap.data());
      cacheService.set(CACHE_KEY, normalized, 1000 * 60 * 5); // 5 mins
      return normalized;
    }
  } catch (err) {
    console.error("Error fetching payment settings:", err);
  }

  return DEFAULT_PAYMENT_CONFIGS;
}

/**
 * Real-time subscription to payment settings
 */
export function subscribePaymentSettings(callback: (settings: PaymentSettingsMap) => void): () => void {
  // Call immediately with cached or default
  const cached = cacheService.get<PaymentSettingsMap>(CACHE_KEY);
  if (cached) {
    callback(cached);
  } else {
    callback(DEFAULT_PAYMENT_CONFIGS);
  }

  return onSnapshot(
    doc(db, "settings", "payment_methods"),
    (snapshot) => {
      if (snapshot.exists()) {
        const normalized = normalizePaymentSettings(snapshot.data());
        cacheService.set(CACHE_KEY, normalized, 1000 * 60 * 5);
        callback(normalized);
      } else {
        callback(DEFAULT_PAYMENT_CONFIGS);
      }
    },
    (error) => {
      console.warn("Payment settings listener warning:", error);
      callback(DEFAULT_PAYMENT_CONFIGS);
    }
  );
}

/**
 * Save updated payment settings to Firestore
 */
export async function savePaymentSettings(settings: PaymentSettingsMap): Promise<void> {
  const docRef = doc(db, "settings", "payment_methods");
  await setDoc(docRef, {
    methods: settings,
    updatedAt: serverTimestamp()
  }, { merge: true });

  cacheService.set(CACHE_KEY, settings, 1000 * 60 * 5);
}
