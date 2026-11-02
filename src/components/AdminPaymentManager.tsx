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
  Check,
  Upload,
  Loader2,
  Plus
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
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase";

import bankilyLogoImg from "../assets/images/bankily_real_logo_1779370169060.png";
import sadadLogoImg from "../assets/images/sadad_real_logo_1779370189416.png";
import gazaLogoImg from "../assets/images/gaza_real_logo_1779370210822.png";

export const AdminPaymentManager: React.FC = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<PaymentSettingsMap>(DEFAULT_PAYMENT_CONFIGS);
  const [uploadingLogoKey, setUploadingLogoKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMethodForm, setNewMethodForm] = useState<{
    id: string;
    label: string;
    labelAr: string;
    phone: string;
    accountHolderAr: string;
    descAr: string;
  }>({
    id: "",
    label: "",
    labelAr: "",
    phone: "",
    accountHolderAr: "موري توب للاستلام",
    descAr: ""
  });

  const handleCreateMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newMethodForm.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanId || !newMethodForm.labelAr.trim()) {
      showToast("يرجى إدخال معرف واسم وسيلة الدفع", "error");
      return;
    }

    const updated = {
      ...settings,
      [cleanId]: {
        id: cleanId,
        label: newMethodForm.label.trim() || cleanId,
        labelAr: newMethodForm.labelAr.trim(),
        labelFr: newMethodForm.label.trim() || cleanId,
        phone: newMethodForm.phone.trim(),
        accountHolderAr: newMethodForm.accountHolderAr.trim(),
        accountHolderFr: "MauriTop Réception",
        enabled: true,
        type: "manual_wallet" as const,
        descAr: newMethodForm.descAr.trim() || "الدفع المباشر",
        descFr: "Paiement direct",
        unavailableReasonAr: "غير متوفر حالياً",
        unavailableReasonFr: "Actuellement indisponible",
        order: Object.keys(settings).length + 1
      }
    };

    try {
      setSettings(updated);
      await savePaymentSettings(updated);
      showToast(`تمت إضافة وتفعيل وسيلة الدفع (${newMethodForm.labelAr}) بنجاح!`, "success");
      setShowAddModal(false);
      setNewMethodForm({
        id: "",
        label: "",
        labelAr: "",
        phone: "",
        accountHolderAr: "موري توب للاستلام",
        descAr: ""
      });
    } catch (err: any) {
      console.error("Add payment method error:", err);
      showToast("فشل إضافة وسيلة الدفع في قاعدة البيانات", "error");
    }
  };

  const handleLogoUpload = async (key: string, file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("حجم الشعار كبير جداً (الحد الأقصى 5 ميجابايت)", "error");
      return;
    }
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
      showToast("يرجى اختيار صورة صالحة (PNG أو JPG أو WEBP)", "error");
      return;
    }

    setUploadingLogoKey(key);
    try {
      const storageRef = ref(storage, `payment-methods/${key}_${Date.now()}.png`);
      const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          () => {},
          (err) => reject(err),
          () => resolve()
        );
      });

      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

      const updated = {
        ...settings,
        [key]: {
          ...settings[key],
          logoUrl: downloadUrl
        }
      };
      setSettings(updated);
      await savePaymentSettings(updated);
      showToast(`تم رفع وتحديث شعار ${settings[key]?.labelAr || key} بنجاح!`, "success");
    } catch (err: any) {
      console.error("Logo upload error:", err);
      showToast("فشل رفع الشعار إلى التخزين السحابي", "error");
    } finally {
      setUploadingLogoKey(null);
    }
  };

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

  const handleToggleStatus = async (methodId: string) => {
    const current = settings[methodId]?.enabled !== false;
    const nextState = !current;

    // Optimistic update
    const updated = {
      ...settings,
      [methodId]: {
        ...settings[methodId],
        enabled: nextState
      }
    };
    setSettings(updated);

    try {
      await savePaymentSettings(updated);
      showToast(
        nextState
          ? `تم تفعيل استقبال الشحن عبر ${settings[methodId]?.labelAr || methodId} وحفظه في Firestore بنجاح`
          : `تم تعطيل الشحن عبر ${settings[methodId]?.labelAr || methodId} وحفظه في Firestore (غير متوفر للزبائن)`,
        nextState ? "success" : "info"
      );
    } catch (err: any) {
      console.error("Auto-save toggle error:", err);
      // Revert on failure
      setSettings(settings);
      showToast("فشل حفظ حالة وسيلة الدفع في Firestore", "error");
    }
  };

  const handleSaveAll = async () => {
    try {
      setIsSavingAll(true);
      await savePaymentSettings(settings);
      showToast("تم حفظ جميع تعديلات طرق الدفع وتطبيقها فورياً على المتجر في Firestore بنجاح 🎉", "success");
    } catch (err: any) {
      console.error("Save payment settings error:", err);
      showToast(`فشل حفظ الإعدادات: ${err?.message || "خطأ غير متوقع"}`, "error");
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm("هل أنت متأكد من استعادة الإعدادات الافتراضية لطرق الدفع (تفعيل بنكيلي 32014902 وسداد 27329380، وتعطيل غزة باي)؟")) {
      const defaultState = Object.fromEntries(
        Object.entries(DEFAULT_PAYMENT_CONFIGS).map(([key, value]) => [key, { ...value }])
      ) as PaymentSettingsMap;
      defaultState.bankily.phone = "32014902";
      defaultState.bankily.enabled = true;
      defaultState.sadad.enabled = true;
      defaultState.sadad.phone = "27329380";
      defaultState.gaza.enabled = false;
      
      setSettings(defaultState);
      showToast("تمت استعادة الإعدادات المطلوبة، يرجى الضغط على حفظ التغييرات لتثبيتها.", "info");
    }
  };

  const handleCopyPhone = (id: string, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    showToast("تم نسخ رقم الحساب", "success");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const methodLogos: Record<string, string> = {
    bankily: bankilyLogoImg,
    sadad: sadadLogoImg,
    gaza: gazaLogoImg,
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
                التحكم المباشر في حالات (بنكيلي، سداد، غزة باي) وتعديل أرقام الحسابات في قاعدة بيانات Firestore
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
            onClick={() => setShowAddModal(true)}
            className="px-4 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            <Plus size={16} />
            <span>إضافة وسيلة دفع جديدة</span>
          </button>

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
                    <div className="relative w-14 h-14 rounded-2xl bg-slate-950 border border-white/10 p-2 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                      {logo ? (
                        <img src={logo} alt={method.labelAr} className="w-full h-full object-contain" />
                      ) : (
                        <CreditCard className="w-6 h-6 text-emerald-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-black text-white">{method.labelAr}</h4>
                      <span className="text-[11px] font-mono text-slate-400 block mb-1.5">{method.label}</span>

                      {/* Prominent permanent button for mobile & desktop to change payment logo */}
                      <label
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 border border-emerald-500/30 text-emerald-300 text-xs font-bold cursor-pointer transition-all shadow-sm"
                      >
                        {uploadingLogoKey === key ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-emerald-400" />
                            <span>جاري الرفع...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} className="text-emerald-400" />
                            <span>رفع / تغيير الشعار</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingLogoKey === key}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLogoUpload(key, f);
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Status Toggle & Integration Badge */}
                  <div className="flex flex-col items-end gap-1.5">
                    {method.type === "electronic_gateway" && method.integrationStatus !== "operational" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300">
                        غير مهيأ بعد (يحتاج ربط API)
                      </span>
                    )}
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
                </div>

                {/* Account Number / Phone Field */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">
                    {key === "bankily" ? "رقم حساب بنكيلي (مطلوب: 32014902)" : "رقم حساب الاستلام / الهاتف"}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={method.phone || ""}
                      onChange={(e) => handleFieldChange(key, "phone", e.target.value)}
                      placeholder={key === "bankily" ? "32014902" : "رقم الحساب"}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono font-black text-white focus:border-emerald-500 outline-none transition-all dir-ltr text-right"
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

      {/* Modal: Add New Payment Method */}
      {showAddModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-white shadow-2xl relative">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2">
              <Plus size={20} className="text-emerald-400" />
              <span>إضافة وسيلة دفع جديدة للنظام</span>
            </h3>

            <form onSubmit={handleCreateMethod} className="space-y-4 text-xs font-bold">
              <div>
                <label className="text-slate-400 block mb-1">المعرف البرمجي (بالحروف الإنجليزية، مثال: masrvi أو click)</label>
                <input
                  type="text"
                  required
                  placeholder="masrvi"
                  value={newMethodForm.id}
                  onChange={(e) => setNewMethodForm({ ...newMethodForm, id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">الاسم بالعربية (مثال: مصرفي أو كليك)</label>
                <input
                  type="text"
                  required
                  placeholder="مصرفي (Masrvi)"
                  value={newMethodForm.labelAr}
                  onChange={(e) => setNewMethodForm({ ...newMethodForm, labelAr: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">رقم الحساب / الهاتف للاستلام</label>
                <input
                  type="text"
                  placeholder="رقم الهاتف أو الحساب"
                  value={newMethodForm.phone}
                  onChange={(e) => setNewMethodForm({ ...newMethodForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">تعليمات التحويل للعميل</label>
                <input
                  type="text"
                  placeholder="التحويل المباشر عبر التطبيق..."
                  value={newMethodForm.descAr}
                  onChange={(e) => setNewMethodForm({ ...newMethodForm, descAr: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  حفظ وتفعيل الوسيلة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
