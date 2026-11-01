import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { cacheService } from "./cache";
import { OFFICIAL_PHONE } from "../constants";

export type PaymentMethodType = "manual_wallet" | "electronic_gateway" | "digital_card";

export type PaymentIntegrationStatus =
  | "disabled"
  | "enabled_unconfigured"
  | "configured_testing"
  | "operational";

export interface PaymentMethodConfig {
  id: "bankily" | "sadad" | "gaza" | string;
  label: string;
  labelAr: string;
  labelFr: string;
  phone: string;
  accountHolderAr: string;
  accountHolderFr: string;
  enabled: boolean;
  integrationStatus?: PaymentIntegrationStatus;
  hidden?: boolean;
  type?: PaymentMethodType;
  instructionsAr?: string;
  instructionsFr?: string;
  unavailableReasonAr?: string;
  unavailableReasonFr?: string;
  descAr?: string;
  descFr?: string;
  logoUrl?: string;
  order?: number;
}

export type PaymentSettingsMap = Record<string, PaymentMethodConfig>;

export const DEFAULT_PAYMENT_CONFIGS: PaymentSettingsMap = {
  bankily: {
    id: "bankily",
    label: "Bankily",
    labelAr: "بنكيلي",
    labelFr: "Bankily",
    phone: "32014902",
    accountHolderAr: "موري توب للاستلام",
    accountHolderFr: "MauriTop Réception",
    enabled: true,
    unavailableReasonAr: "غير متوفر حالياً",
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
    unavailableReasonAr: "غير متوفر حالياً",
    unavailableReasonFr: "Actuellement indisponible",
    descAr: "التحويل السريع والمباشر عبر سداد",
    descFr: "Transfert rapide via Sedad (BIM)"
  },
  gaza: {
    id: "gaza",
    label: "GazaPay",
    labelAr: "غزة باي (GazaPay)",
    labelFr: "GazaPay",
    phone: "27329380",
    accountHolderAr: "موري توب للاستلام",
    accountHolderFr: "MauriTop Réception",
    enabled: true,
    hidden: false,
    type: "manual_wallet",
    integrationStatus: "operational",
    unavailableReasonAr: "غير متوفر حالياً",
    unavailableReasonFr: "Actuellement indisponible",
    descAr: "الدفع الفوري والمباشر عبر محفظة غزة باي / غزة كاش",
    descFr: "Paiement instantané via GazaPay"
  },
  paypal: {
    id: "paypal",
    label: "PayPal",
    labelAr: "بايبال (PayPal)",
    labelFr: "PayPal",
    phone: "",
    accountHolderAr: "غير مهيأ بعد",
    accountHolderFr: "Non configuré",
    enabled: false,
    hidden: true,
    type: "electronic_gateway",
    integrationStatus: "enabled_unconfigured",
    unavailableReasonAr: "بوابة الدفع الإلكتروني عبر PayPal قيد التهيئة والربط البرمجي",
    unavailableReasonFr: "Passerelle PayPal en cours de configuration",
    descAr: "الدفع الإلكتروني بالبطاقات البنكية الدولية وحساب بايبال",
    descFr: "Paiement en ligne par carte et PayPal"
  }
};

const CACHE_KEY = "system_payment_settings";

/**
 * Normalizes payment methods map ensuring all standard keys exist
 */
export function normalizePaymentSettings(raw: any): PaymentSettingsMap {
  const result: PaymentSettingsMap = { ...DEFAULT_PAYMENT_CONFIGS };
  if (!raw || typeof raw !== "object") return result;

  const methods = raw.methods || raw;
  
  for (const key of Object.keys(DEFAULT_PAYMENT_CONFIGS)) {
    if (methods[key]) {
      const configuredPhone = String(methods[key].phone || methods[key].accountNumber || DEFAULT_PAYMENT_CONFIGS[key].phone || '').trim();
      const normalizedPhone = key === 'bankily' && configuredPhone === '32024902'
        ? DEFAULT_PAYMENT_CONFIGS.bankily.phone
        : configuredPhone;
      result[key] = {
        ...DEFAULT_PAYMENT_CONFIGS[key],
        ...methods[key],
        id: key,
        // If an older settings document lacks `enabled`, preserve the safe
        // default for that method instead of accidentally enabling disabled providers.
        enabled: typeof methods[key].enabled === 'boolean' ? methods[key].enabled : DEFAULT_PAYMENT_CONFIGS[key].enabled,
        phone: normalizedPhone,
        logoUrl: methods[key].logoUrl || undefined,
        order: typeof methods[key].order === 'number' ? methods[key].order : 0,
        unavailableReasonAr: methods[key].unavailableReasonAr || DEFAULT_PAYMENT_CONFIGS[key].unavailableReasonAr || "غير متوفر حالياً",
        unavailableReasonFr: methods[key].unavailableReasonFr || DEFAULT_PAYMENT_CONFIGS[key].unavailableReasonFr || "Actuellement indisponible"
      };
    }
  }

  // Also include any extra custom payment methods added in Firestore
  for (const [key, val] of Object.entries(methods)) {
    if (!result[key] && val && typeof val === "object") {
      result[key] = val as PaymentMethodConfig;
    }
  }

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
