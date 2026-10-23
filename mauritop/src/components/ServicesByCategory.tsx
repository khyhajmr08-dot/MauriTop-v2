import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gamepad2, Tv, Gift, Sparkles, Layers, Zap } from "lucide-react";
import { useLanguage } from '../contexts/LanguageContext';
import OptimizedImage from "./OptimizedImage";
import { Skeleton } from "./Skeleton";
import { haptic } from "../lib/utils";

type Service = {
  id: string;
  title: string;
  imageUrl: string;
  priceMru: number;
  category: "ألعاب" | "اشتراكات رقمية" | "بطاقات الهدايا" | "خدمات رقمية" | string;
  status: "active" | "inactive" | string;
  imageFit?: 'cover' | 'contain';
  imagePadding?: number;
  order?: number;
};

type Props = {
  services: Service[];
  onOpenService: (service: Service) => void;
  loading?: boolean;
};

const ALL = "ALL";
const CATEGORIES = [
  "ألعاب",
  "اشتراكات رقمية",
  "بطاقات الهدايا",
  "خدمات رقمية",
];

const categoryTranslations: Record<string, { ar: string, fr: string }> = {
  "ALL": { ar: "جميع الخدمات", fr: "Tous les services" },
  "ألعاب": { ar: "ألعاب إلكترونية", fr: "Jeux Vidéo" },
  "اشتراكات رقمية": { ar: "اشتراكات رقمية", fr: "Abonnements Digital" },
  "بطاقات الهدايا": { ar: "بطاقات الهدايا", fr: "Cartes Cadeaux" },
  "خدمات رقمية": { ar: "خدمات رقمية", fr: "Services Numériques" },
};

const categoryDescriptions: Record<string, { ar: string, fr: string }> = {
  "ألعاب": { ar: "شحن فوري ومضمون لأفضل الألعاب الحصرية", fr: "Recharge rapide et sécurisée pour vos jeux préférés" },
  "اشتراكات رقمية": { ar: "اشتراكات البث والترفيه بأسعار مميزة وسرعة تفعيل", fr: "Abonnements streaming & divertissement de haute qualité" },
  "بطاقات الهدايا": { ar: "بطاقات رصيد هدايا فورية ومتنوعة", fr: "Cartes cadeaux et recharges numériques instantanées" },
  "خدمات رقمية": { ar: "حلول وخدمات إلكترونية متكاملة وتصاميم", fr: "Solutions & services numériques sur mesure" },
};

function getCategoryIcon(cat: string, className = "w-4 h-4") {
  switch (cat) {
    case "ALL":
      return <Layers className={className} strokeWidth={1.75} />;
    case "ألعاب":
      return <Gamepad2 className={className} strokeWidth={1.75} />;
    case "اشتراكات رقمية":
      return <Tv className={className} strokeWidth={1.75} />;
    case "بطاقات الهدايا":
      return <Gift className={className} strokeWidth={1.75} />;
    case "خدمات رقمية":
      return <Sparkles className={className} strokeWidth={1.75} />;
    default:
      return <Zap className={className} strokeWidth={1.75} />;
  }
}

type CategorySectionProps = {                
  category: string; 
  items: Service[]; 
  onOpenService: (service: Service) => void;
  isArabic: boolean;
};

function CategorySection({ category, items, onOpenService, isArabic }: CategorySectionProps) {
  return (
    <section className="space-y-3 sm:space-y-4 w-full pt-1 sm:pt-2">
      {/* Polished Section Header */}
      <div className="flex items-center justify-between gap-2 px-1 w-full pb-2 border-b border-white/5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/10">
            {getCategoryIcon(category, "w-4 h-4 sm:w-5 sm:h-5")}
          </div>
          <div className="text-right">
            <h2 className="text-sm sm:text-base md:text-lg font-black text-white tracking-tight leading-tight">
              {categoryTranslations[category]?.[isArabic ? 'ar' : 'fr'] || category}
            </h2>
            {categoryDescriptions[category] && (
              <p className="text-[11px] sm:text-xs text-slate-400 font-medium mt-0.5 line-clamp-1">
                {categoryDescriptions[category][isArabic ? 'ar' : 'fr']}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <span className="rounded-xl bg-[#0E1626] border border-white/10 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-emerald-400 inline-flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{items.length}</span>
            <span className="text-slate-400 font-normal">{isArabic ? "خدمة" : "Service(s)"}</span>
          </span>
        </div>
      </div>

      {/* Responsive Two-Column Mobile Grid - Never clips on screen edges */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 xs:gap-3 sm:gap-4 w-full pt-1">
        {items.map((service, idx) => (
          <Link
            to={`/services/${service.id}`}
            key={service.id}
            onClick={() => {
              haptic.light();
              onOpenService(service);
            }}
            title={service.title}
            className="
              group relative cursor-pointer 
              flex flex-col justify-between
              w-full h-full
              bg-[#0E1626] rounded-2xl 
              overflow-hidden 
              border border-white/10 hover:border-emerald-400/40 hover:bg-[#121D31]
              transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-emerald-500/10 hover:-translate-y-0.5 active:scale-[0.98]
              text-center select-none no-underline
            "
          >
            {/* Image Container - Aspect 1:1 square, consistent height across all devices */}
            <div className="w-full aspect-square relative bg-[#070B14] overflow-hidden flex items-center justify-center">
              {/* Subtle bottom gradient overlay for smooth integration */}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0E1626] to-transparent z-10 pointer-events-none" />

              <OptimizedImage
                src={service.imageUrl}
                alt={`شحن ${service.title} في موريتانيا`}
                fallbackTitle={service.title}
                fallbackId={service.id}
                aspectRatio="1/1"
                objectFit={service.imageFit === 'contain' ? 'contain' : 'cover'}
                padding={service.imagePadding || (service.imageFit === 'contain' ? 10 : 0)}
                className="transition-transform duration-300 group-hover:scale-105"
              />

              {/* Offer badge */}
              {idx === 0 && (
                <div className="absolute top-2 right-2 z-20 pointer-events-none">
                  <span className="px-2 py-0.5 bg-rose-600/90 text-white rounded-md text-[10px] font-bold shadow-md border border-rose-400/30">
                    {isArabic ? "مميز 🔥" : "Top 🔥"}
                  </span>
                </div>
              )}
            </div>

            {/* Content Section - uniform height and alignment */}
            <div className="p-2 sm:p-2.5 w-full bg-[#0E1626] relative z-20 flex flex-col justify-between flex-grow border-t border-white/5">
              <h3 
                className="line-clamp-2 text-xs sm:text-sm font-bold text-white text-center leading-snug group-hover:text-emerald-300 transition-colors duration-200 min-h-[2.4rem] flex items-center justify-center px-1"
                title={service.title}
              >
                {service.title}
              </h3>
              {service.priceMru > 0 ? (
                <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-black text-emerald-400">
                  <span>{service.priceMru}</span>
                  <span className="text-[10px] text-slate-400 font-bold">{isArabic ? "أوقية" : "MRU"}</span>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-center">
                  <span className="text-[10px] font-medium text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">
                    {isArabic ? "شحن فوري" : "Instantané"}
                  </span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function ServicesByCategory({ services, onOpenService, loading }: Props) {
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  const grouped = useMemo(() => {
    const map: Record<string, Service[]> = {
      "ألعاب": [],
      "اشتراكات رقمية": [],
      "بطاقات الهدايا": [],
      "خدمات رقمية": [],
    };

    services.forEach((service) => {
      if (service.status !== "active") return;
      map[service.category]?.push(service);
    });

    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => {
        const orderA = a.order ?? 9999;
        const orderB = b.order ?? 9999;
        return orderA - orderB;
      });
    });

    return map;
  }, [services]);

  const displayedCategories = activeCategory === ALL 
    ? CATEGORIES 
    : [activeCategory as typeof CATEGORIES[number]];

  const totalCount = useMemo(() => {
    return services.filter(s => s.status === 'active').length;
  }, [services]);

  if (loading) {
    return (
      <div className="space-y-6 sm:space-y-8 w-full animate-in fade-in duration-300">
        {/* Skeleton Filters */}
        <div className="flex items-center sm:justify-center gap-2 px-1 pb-1 overflow-x-hidden w-full">
          {[
            { w: "w-24" },
            { w: "w-28" },
            { w: "w-32" },
            { w: "w-28" },
            { w: "w-28" }
          ].map((item, i) => (
            <Skeleton key={i} className={`h-9 sm:h-10 ${item.w} rounded-xl shrink-0 border border-white/10`} />
          ))}
        </div>
        
        {/* Skeleton Categories */}
        {[
          { titleWidth: "w-32", subtitleWidth: "w-48" },
          { titleWidth: "w-36", subtitleWidth: "w-56" }
        ].map((cat, sectionIdx) => (
          <section key={sectionIdx} className="space-y-3 sm:space-y-4 w-full pt-1 sm:pt-2">
            <div className="flex items-center justify-between gap-2 px-1 w-full pb-2 border-b border-white/5">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <Skeleton className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl shrink-0 border border-emerald-500/20" />
                <div className="space-y-1">
                  <Skeleton className={`h-4.5 ${cat.titleWidth} rounded-md`} />
                  <Skeleton className={`h-3 ${cat.subtitleWidth} rounded-md`} />
                </div>
              </div>
              <div className="shrink-0">
                <Skeleton className="h-6 w-16 rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 xs:gap-3 sm:gap-4 w-full pt-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="relative flex flex-col w-full h-full bg-[#0E1626] rounded-2xl overflow-hidden border border-white/10 shadow-sm">
                  <div className="w-full aspect-square relative bg-[#070B14] overflow-hidden">
                    <Skeleton className="w-full h-full rounded-none" />
                  </div>
                  <div className="p-2 sm:p-2.5 w-full bg-[#0E1626] relative z-20 min-h-[58px] flex flex-col justify-center items-center gap-1.5 border-t border-white/5">
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                    <Skeleton className="h-3 w-1/2 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 w-full">
      {/* Sleek Category Filter Pills Bar - Smooth and touch-friendly */}
      <div className="relative w-full" dir={isArabic ? "rtl" : "ltr"}>
        <div className="flex items-center sm:justify-center gap-1.5 xs:gap-2 px-1 pb-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth focus:outline-none overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          {/* ALL Tab */}
          <button
            onClick={() => {
              haptic.light();
              setActiveCategory(ALL);
            }}
            className={`flex items-center gap-1.5 xs:gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer shrink-0 border ${
              activeCategory === ALL 
                ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20 scale-[1.02]" 
                : "bg-[#0E1626] text-slate-300 border-white/10 hover:border-emerald-500/30 hover:text-white hover:bg-[#121D31]"
            }`}
          >
            {getCategoryIcon(ALL, "w-3.5 h-3.5")}
            <span>{categoryTranslations[ALL]?.[isArabic ? 'ar' : 'fr']}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
              activeCategory === ALL ? "bg-slate-950/20 text-slate-950" : "bg-white/10 text-emerald-300"
            }`}>
              {totalCount}
            </span>
          </button>

          {/* Individual Category Tabs */}
          {CATEGORIES.map((category) => {
            const count = grouped[category]?.length || 0;
            const isActive = activeCategory === category;

            return (
              <button
                key={category}
                onClick={() => {
                  haptic.light();
                  setActiveCategory(category);
                }}
                className={`flex items-center gap-1.5 xs:gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer shrink-0 border ${
                  isActive 
                    ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20 scale-[1.02]" 
                    : "bg-[#0E1626] text-slate-300 border-white/10 hover:border-emerald-500/30 hover:text-white hover:bg-[#121D31]"
                }`}
              >
                {getCategoryIcon(category, "w-3.5 h-3.5")}
                <span>{categoryTranslations[category]?.[isArabic ? 'ar' : 'fr']}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                  isActive ? "bg-slate-950/20 text-slate-950" : "bg-white/10 text-emerald-300"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {displayedCategories.map((category) => {
        const items = grouped[category];
        if (!items || !items.length) return null;

        return (
          <CategorySection 
            key={category} 
            category={category} 
            items={items} 
            onOpenService={onOpenService} 
            isArabic={isArabic}
          />
        );
      })}
    </div>
  );
}
