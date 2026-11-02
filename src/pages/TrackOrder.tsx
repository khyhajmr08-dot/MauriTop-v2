import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import SEO from "../components/SEO";
import {
  Search,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Key,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { formatMRU, cn } from "../lib/utils";

export default function TrackOrder() {
  const { language, isRtl } = useLanguage();
  const isArabic = language === "ar";

  const [orderId, setOrderId] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderResult, setOrderResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = orderId.trim();
    const cleanToken = trackingToken.trim();

    if (!cleanId || !cleanToken) {
      setErrorMsg(isArabic ? "يرجى إدخال رقم الطلب والرمز السري للتتبع" : "Veuillez entrer le numéro de commande et le code secret");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setOrderResult(null);

    try {
      const res = await fetch("/api/guest/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: cleanId, trackingToken: cleanToken })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isArabic ? "تعذر العثور على الطلب أو الرمز غير صحيح" : "Commande introuvable"));
      }

      setOrderResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || (isArabic ? "حدث خطأ أثناء تتبع الطلب" : "Erreur de suivi"));
    } finally {
      setLoading(false);
    }
  };

  const getStatusArabic = (status: string) => {
    switch (status) {
      case "completed": return "مكتمل وتم الشحن ✓";
      case "pending": return "قيد المعالجة والتنفيذ ⏳";
      case "rejected": return "مرفوض أو ملغي ✕";
      default: return status;
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4" dir={isRtl ? "rtl" : "ltr"}>
      <SEO
        title={isArabic ? "تتبع حالة الطلب للزوار | موري توب" : "Suivi de Commande | MauriTop"}
        description={isArabic ? "تتبع فوري ومباشر لطلبات الشحن للزوار باستخدام الرمز السري ورقم الطلب." : "Suivez votre commande invitée en direct avec votre code secret."}
      />

      <div className="bg-[#0B1220]/90 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
            <Search size={24} />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            {isArabic ? "تتبع طلبك المباشر كزائر" : "Suivi de votre commande"}
          </h1>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {isArabic
              ? "أدخل رقم الطلب والرمز السري الفريد الذي استلمته عند إرسال طلب الشحن للاطلاع على حالته الحالية فورياً."
              : "Entrez votre numéro de commande et le code secret reçu lors du paiement pour consulter son statut en direct."}
          </p>
        </div>

        <form onSubmit={handleTrackSubmit} className="space-y-4 max-w-lg mx-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              {isArabic ? "رقم الطلب (Order ID):" : "Numéro de commande :"}
            </label>
            <input
              type="text"
              required
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder={isArabic ? "مثال: aBcDeF12345" : "Ex: aBcDeF12345"}
              className="w-full bg-[#050811] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Key size={14} className="text-amber-400" />
              <span>{isArabic ? "الرمز السري للتتبع (Tracking Token):" : "Code secret de suivi :"}</span>
            </label>
            <input
              type="text"
              required
              value={trackingToken}
              onChange={(e) => setTrackingToken(e.target.value)}
              placeholder="32-character secret token"
              className="w-full bg-[#050811] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>{isArabic ? "جاري التحقق والتتبع..." : "Vérification..."}</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>{isArabic ? "استعلام عن حالة الطلب" : "Vérifier le statut"}</span>
              </>
            )}
          </button>
        </form>

        {orderResult && (
          <div className="bg-[#050811] border border-emerald-500/30 rounded-2xl p-5 space-y-4 max-w-lg mx-auto">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs text-slate-400 font-bold">{isArabic ? "الخدمة:" : "Service :"}</span>
              <span className="text-sm font-black text-white">{orderResult.serviceType}</span>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs text-slate-400 font-bold">{isArabic ? "المبلغ:" : "Montant :"}</span>
              <span className="text-sm font-mono font-black text-emerald-400">{orderResult.amount} MRU</span>
            </div>

            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs text-slate-400 font-bold">{isArabic ? "حالة الطلب:" : "Statut :"}</span>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-black",
                orderResult.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                orderResult.status === "rejected" ? "bg-rose-500/15 text-rose-400 border border-rose-500/30" :
                "bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse"
              )}>
                {isArabic ? getStatusArabic(orderResult.status) : orderResult.status}
              </span>
            </div>

            <div className="text-center pt-2">
              <Link to="/" className="text-xs font-bold text-emerald-400 hover:underline">
                {isArabic ? "← العودة لمتجر الخدمات" : "← Retour à la boutique"}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
