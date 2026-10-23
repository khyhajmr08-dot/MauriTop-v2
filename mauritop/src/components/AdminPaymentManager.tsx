import React, { useState, useEffect } from "react";
import { 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  Save, 
  Smartphone, 
  ShieldCheck, 
  Copy, 
  RotateCcw,
  Check
} from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { 
  PaymentMethodConfig, 
  PaymentSettingsMap, 
  DEFAULT_PAYMENT_CONFIGS, 
  subscribePaymentSettings, 
  savePaymentSettings 
} from "../lib/paymentSettings";

import bankilyLogoImg from "../assets/images/bankily_real_logo_1779370169060.png";
import sadadLogoImg from "../assets/images/sadad_real_logo_1779370189416.png";

export const AdminPaymentManager: React.FC = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<PaymentSettingsMap>(DEFAULT_PAYMENT_CONFIGS);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePaymentSettings((data) => {
      setSettings(data);
    });
    return () => unsubscribe();
  }, []);

  const handleFieldChange = (methodId: string, field: keyof PaymentMethodConfig, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [methodId]: {
        ...prev[methodId],
        [field]: value,
      },
    }));
  };

  const handleToggleStatus = (methodId: string) => {
    if (methodId === "paypal") {
      showToast("PayPal سيبقى معطلاً حتى إعداد تكامل دفع موثوق على الخادم واختباره.", "info");
      handleFieldChange("paypal", "enabled", false);
      return;
    }
    const current = settings[methodId]?.enabled !== false;
    handleFieldChange(methodId, "enabled", !current);
    showToast(
      !current 
        ? `تم تفعيل استقبال الشحن عبر ${settings[methodId]?.labelAr || methodId} بنجاح` 
        : `تم تعطيل الشحن عبر ${settings[methodId]?.labelAr || methodId} (سيظهر للزبائن: غير متوفر)`,
      !current ? "success" : "info"
    );
  };

  const handleSaveAll = async () => {
    try {
      for (const id of ["bankily", "sadad"]) {
        const method = settings[id];
        const digits = String(method?.phone || "").replace(/\D/g, "");
        if (method?.enabled && !/^\d{8}$/.test(digits)) {
          showToast(`رقم الاستلام لوسيلة ${method?.labelAr || id} يجب أن يتكون من 8 أرقام.`, "error");
          return;
        }
      }
      const safeSettings = {
        ...settings,
        paypal: { ...(settings.paypal || DEFAULT_PAYMENT_CONFIGS.paypal), enabled: false, phone: "" },
      };
      delete (safeSettings as any).gaza;
      setIsSavingAll(true);
      await savePaymentSettings(safeSettings);
      setSettings(safeSettings);
      showToast("تم حفظ جميع تعديلات طرق الدفع وتطبيقها فورياً على المتجر في Firestore بنجاح 🎉", "success");
    } catch (err: any) {
      console.error("Save payment settings error:", err);
      showToast(`فشل حفظ الإعدادات: ${err?.message || "خطأ غير متوقع"}`, "error");
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm("هل تريد استعادة إعدادات طرق الدفع الافتراضية المحددة في مصدر المشروع؟ لن تُحفظ التغييرات حتى تضغط زر الحفظ.")) {
      const defaultState = Object.fromEntries(
        Object.entries(DEFAULT_PAYMENT_CONFIGS).map(([key, value]) => [key, { ...value }])
      ) as PaymentSettingsMap;
      setSettings(defaultState);
      showToast("تم تحميل الإعدادات الافتراضية. راجع أرقام الاستلام والحالات ثم اضغط حفظ التغييرات.", "info");
    }
  };

  const handleCopyPhone = async (id: string, phone: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(String(phone || "").replace(/\D/g, ""));
      setCopiedId(id);
      showToast("تم نسخ رقم الحساب", "success");
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.warn("Could not copy payment number", error);
      showToast("تعذر النسخ التلقائي. حدّد الرقم وانسخه يدوياً.", "error");
    }
  };

  const methodLogos: Record<string, string> = {
    bankily: bankilyLogoImg,
    sadad: sadadLogoImg,
  };

  const activeMethodsCount = Object.values(settings).filter((m) => m.enabled !== false).length;
  const disabledMethodsCount = Object.values(settings).filter((m) => m.enabled === false).length;

  return (
    <div className="space-y-6 text-right animate-fade-in" dir="rtl">
      
      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 text-white">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
              <CreditCard size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">إدارة طرق الدفع وحسابات الاستلام (AdminPaymentManager)</h3>
              <p className="text-xs text-slate-400 font-bold mt-0.5">
                التحكم في بنكيلي وسداد. يظهر PayPal كخيار قادم غير قابل للتفعيل حتى اكتمال التكامل الآمن
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>الطرق المفعلة: {activeMethodsCount}</span>
            </span>

            {disabledMethodsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>الطرق المعطلة: {disabledMethodsCount}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 border border-slate-700"
          >
            <RotateCcw size={15} />
            <span>ضبط الحالة الافتراضية</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSavingAll}
            className={cn(
              "px-6 py-3.5 rounded-2xl font-black text-xs text-slate-950 transition-all flex items-center gap-2.5 shadow-lg cursor-pointer active:scale-95",
              isSavingAll 
                ? "bg-slate-600 cursor-not-allowed text-white" 
                : "bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 shadow-emerald-500/20"
            )}
          >
            <Save size={16} />
            <span>{isSavingAll ? "جاري الحفظ..." : "حفظ جميع التغييرات في Firestore"}</span>
          </button>
        </div>
      </div>

      {/* Methods Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {Object.entries(settings).map(([key, method]) => {
          const isEnabled = method.enabled !== false;
          const logo = methodLogos[key];

          return (
            <div 
              key={key}
              className={cn(
                "rounded-3xl border p-5 flex flex-col justify-between transition-all shadow-lg relative overflow-hidden",
                isEnabled 
                  ? "bg-slate-900 border-emerald-500/30 shadow-emerald-500/5" 
                  : "bg-slate-950/80 border-slate-800 opacity-80"
              )}
            >
              {/* Top Accent Bar */}
              <div className={cn(
                "absolute top-0 inset-x-0 h-1.5",
                isEnabled ? "bg-emerald-500" : "bg-slate-700"
              )} />

              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-white/10 p-2 flex items-center justify-center shrink-0">
                      {logo ? (
                        <img src={logo} alt={method.labelAr} className="w-full h-full object-contain" />
                      ) : (
                        <CreditCard className="w-6 h-6 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-base font-black text-white">{method.labelAr}</h4>
                      <span className="text-[11px] font-mono text-slate-400 block">{method.label}</span>
                    </div>
                  </div>

                  {/* Status Toggle Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(key)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer border",
                      isEnabled
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                        : "bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30"
                    )}
                  >
                    {isEnabled ? (
                      <>
                        <CheckCircle2 size={13} />
                        <span>مفعل</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={13} />
                        <span>معطل</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Account Number / Future payment method status */}
                {key === "paypal" ? (
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs leading-6 text-sky-200">
                    <strong className="block">PayPal — قريباً</strong>
                    لن يمكن تفعيله حتى ربط مزود دفع موثوق بالخادم والتحقق من إشعارات الدفع والتوقيعات. لا تُدخل بيانات حسابك هنا الآن.
                  </div>
                ) : key === "gaza" ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">وسيلة قديمة محفوظة للتوافق فقط، لكنها غير متاحة للعملاء.</div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 block">
                      {key === "bankily" ? "رقم استلام بنكيلي التجاري (8 أرقام)" : "رقم حساب سداد (8 أرقام)"}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={8}
                        value={method.phone || ""}
                        onChange={(e) => handleFieldChange(key, "phone", e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder={key === "bankily" ? "32014902" : "27329380"}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono font-black text-white focus:border-emerald-500 outline-none transition-all text-left"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyPhone(key, method.phone)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                        title="نسخ الرقم"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Account Holder Name */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">
                    اسم صاحب الحساب
                  </label>
                  <input
                    type="text"
                    value={method.accountHolderAr || ""}
                    onChange={(e) => handleFieldChange(key, "accountHolderAr", e.target.value)}
                    placeholder="موري توب للاستلام"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">
                    وصف أو تعليمات طريقة الدفع
                  </label>
                  <input
                    type="text"
                    value={method.descAr || ""}
                    onChange={(e) => handleFieldChange(key, "descAr", e.target.value)}
                    placeholder="تعليمات التحويل..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Card Footer Save Button */}
              <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  {isEnabled ? "🟢 متاح للعملاء" : "🔴 غير متاح حالياً"}
                </span>

                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Save size={13} />
                  <span>حفظ</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
