import React from "react";
import { CheckCircle2, Copy, ShieldCheck, ArrowRight, Zap, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

// Bank logos
import sadadLogoImg from "../assets/images/sadad_real_logo_1779370189416.png";
import bankilyLogoImg from "../assets/images/bankily_real_logo_1779370169060.png";
import gazaLogoImg from "../assets/images/gaza_real_logo_1779370210822.png";

interface PaymentMethodCardProps {
  paymentMethod: "bankily" | "sadad" | string;
  amount: number | string;
  language: string;
  copied: boolean;
  onCopy: () => void;
  accountNumber?: string;
  accountHolder?: string;
  serviceTitle?: string;
  serviceImage?: string;
  serviceCategory?: string;
  isAvailable?: boolean;
  unavailableReason?: string;
  methodLabel?: string;
  methodDescription?: string;
}

export const PAYMENT_POSTS = [
  {
    id: "bankily" as const,
    logo: bankilyLogoImg,
    label: "Bankily",
    desc: "Instant transfer via Bankily app",
  },
  {
    id: "sadad" as const,
    logo: sadadLogoImg,
    label: "Sadad",
    desc: "Instant transfer via Sedad app",
  },
];

export const PaymentMethodCard: React.FC<PaymentMethodCardProps> = ({
  paymentMethod,
  amount,
  language,
  copied,
  onCopy,
  accountNumber = "",
  accountHolder,
  serviceTitle,
  isAvailable = true,
  unavailableReason,
  methodLabel,
  methodDescription,
}) => {
  const isArabic = language === "ar";
  const isBankily = paymentMethod === "bankily";
  const isGaza = paymentMethod === "gaza";

  // Confirmed branding details
  const methodInfo = isBankily
    ? {
        name: methodLabel || (isArabic ? "بنكيلي (Bankily)" : "Bankily (BPM)"),
        bank: isArabic ? "البنك الشعبي الموريتاني" : "Banque Populaire de Mauritanie",
        logo: bankilyLogoImg,
        badge: isArabic ? "تحويل فوري" : "Instantané",
        accent: "emerald",
      }
    : isGaza
      ? {
          name: methodLabel || (isArabic ? "غزة باي" : "GazaPay"),
          bank: methodDescription || "",
          logo: gazaLogoImg,
          badge: isArabic ? "وسيلة دفع" : "Paiement",
          accent: "cyan",
        }
      : {
          name: methodLabel || (isArabic ? "سداد (Sedad)" : "Sedad (BIM)"),
          bank: isArabic ? "البنك الإسلامي الموريتاني" : "Banque Islamique de Mauritanie",
          logo: sadadLogoImg,
          badge: isArabic ? "تحويل مباشر" : "Direct",
          accent: "cyan",
        };

  // Always render the numeric account in LTR, grouped 2-2-2-2, regardless of page RTL.
  const cleanAccountNumber = String(accountNumber || "").replace(/\D/g, "");
  const formattedNumber = cleanAccountNumber.length === 8
    ? `${cleanAccountNumber.slice(0, 2)} ${cleanAccountNumber.slice(2, 4)} ${cleanAccountNumber.slice(4, 6)} ${cleanAccountNumber.slice(6, 8)}`
    : "";

  const resolvedAccountHolder =
    accountHolder ||
    (isArabic ? "موري توب للاستلام" : "MauriTop Réception");

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className="relative w-full rounded-2xl bg-[#0C1527] p-3 sm:p-3.5 border border-white/10 shadow-sm space-y-3 overflow-hidden select-none"
    >
      {/* Top subtle ambient emerald gradient glow edge */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />

      {/* Header Row: Bank Logo + Method Name + Amount Due Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/[0.04] border border-white/10 p-1 flex items-center justify-center shrink-0 shadow-sm">
            <img
              src={methodInfo.logo}
              alt={methodInfo.name}
              className="w-full h-full object-contain filter brightness-105"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-black text-white truncate">
                {methodInfo.name}
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                {methodInfo.badge}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium block truncate">
              {methodInfo.bank}
            </span>
          </div>
        </div>

        {/* Amount Due Pill */}
        <div className="shrink-0 text-left rtl:text-right bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-xl">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-none mb-0.5">
            {isArabic ? "المبلغ المستحق" : "Montant"}
          </span>
          <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono leading-none">
            <bdi dir="ltr">{amount} <span className="text-[10px] text-emerald-300 font-sans">MRU</span></bdi>
          </span>
        </div>
      </div>

      {/* Unavailable Warning if method is disabled */}
      {!isAvailable && (
        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-bold text-center flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>
            {unavailableReason ||
              (isArabic
                ? "طريقة الدفع هذه متوقفة مؤقتاً للصيانة، يرجى اختيار الوسيلة الأخرى."
                : "Mode de paiement temporairement indisponible.")}
          </span>
        </div>
      )}

      {/* Destination Account Number & Copy Box (The Hero Element) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 px-0.5">
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isArabic ? "رقم التحويل الرسمي (اضغط للنسخ):" : "Numéro de transfert (cliquez pour copier) :"}</span>
          </span>
          <span className="text-[10px] text-emerald-400/90 font-mono flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>{isArabic ? "بيانات الاستلام" : "Compte de réception"}</span>
          </span>
        </div>

        <div className="bg-[#050811] border border-emerald-500/35 hover:border-emerald-400/60 rounded-xl px-3 sm:px-4 py-2 flex items-center justify-between gap-3 transition-colors shadow-inner">
          <div className="min-w-0" dir="ltr">
            <span className="text-base sm:text-xl font-black text-white font-mono tracking-[0.14em] sm:tracking-[0.18em] select-all block text-left">
              {formattedNumber || (isArabic ? "رقم الاستلام غير مضبوط" : "Numéro non configuré")}
            </span>
          </div>

          <button
            type="button"
            onClick={onCopy}
            disabled={!accountNumber || !isAvailable}
            aria-label={isArabic ? "نسخ رقم الحساب" : "Copier le numéro"}
            className={cn(
              "px-3.5 sm:px-4 py-1.5 rounded-lg text-xs font-black transition-all duration-200 cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed",
              copied
                ? "bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/30"
                : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20"
            )}
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isArabic ? "تم النسخ" : "Copié"}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{isArabic ? "نسخ الرقم" : "Copier"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Account Beneficiary & Service Details */}
      <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-slate-400 font-medium">{isArabic ? "المستلم:" : "Bénéficiaire :"}</span>
          <span className="font-bold text-white truncate">{resolvedAccountHolder}</span>
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
        </div>
        {serviceTitle && (
          <span className="text-[10px] text-emerald-400/90 font-bold shrink-0 truncate max-w-[130px]">
            {serviceTitle}
          </span>
        )}
      </div>

      {/* 2-Step Ultra-Compact Guidance Strip */}
      <div className="pt-2 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] sm:text-[11px]">
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0">
            1
          </span>
          <p className="text-slate-300 leading-snug">
            {isArabic ? (
              <>حول <strong className="text-emerald-400">{amount} MRU</strong> للرقم أعلاه عبر التطبيق</>
            ) : (
              <>Transférez <strong className="text-emerald-400">{amount} MRU</strong> via l'application</>
            )}
          </p>
        </div>

        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0">
            2
          </span>
          <p className="text-slate-300 leading-snug">
            {isArabic ? (
              <>أدخل رقم هاتفك المُرْسِل وأرفق لقطة الإيصال بالأسفل</>
            ) : (
              <>Entrez votre numéro et joignez la capture du reçu ci-dessous</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodCard;
