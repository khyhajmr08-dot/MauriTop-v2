import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, ChevronLeft, ChevronRight, Sparkles, Flame } from 'lucide-react';
import { cacheService } from '../lib/cache';
import { cn } from '../lib/utils';
import { OFFICIAL_PHONE } from '../constants';

export const WhatsAppOffers: React.FC = () => {
  const [offers, setOffers] = useState<any[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const { language, isRtl } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchOffers = async () => {
      const cached = cacheService.get<any[]>("whatsapp_offers");
      if (cached) setOffers(cached);
      try {
        const q = query(collection(db, "posts"), where("status", "==", "approved"));
        const snap = await getDocs(q);
        const approvedOffers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => {
          const aTime = a.createdAt?.toMillis?.() ?? (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const bTime = b.createdAt?.toMillis?.() ?? (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return bTime - aTime;
        });
        setOffers(approvedOffers);
        cacheService.set("whatsapp_offers", approvedOffers, 1000 * 60 * 30);
      } catch (error) {
        console.error("Error fetching offers:", error);
      }
    };
    fetchOffers();
  }, []);

  useEffect(() => {
    if (selectedOffer) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedOffer]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const offset = direction === 'left' ? -320 : 320;
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  if (offers.length === 0) return null;

  return (
    <div className="mt-8 mb-6 px-4 sm:px-6 relative text-right" dir={isRtl ? "rtl" : "ltr"}>
      {/* Premium Header with Slide Controls */}
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-4 px-1">
        <div className={cn("flex flex-col gap-0.5", isRtl ? "text-right" : "text-left")}>
          <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
            <Flame className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.6} />
            <span>{language === 'ar' ? 'عروض حصرية ولفترة محدودة' : 'Offres exclusives'}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-1.5">
            {language === 'ar' ? 'العروض الحصرية' : 'Offres Exclusives'}
          </h2>
        </div>

        {/* Carousel Arrow Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleScroll(isRtl ? 'right' : 'left')}
            className="w-8 h-8 rounded-xl border border-white/10 bg-[#0E1626] flex items-center justify-center text-slate-300 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-400 transition-all active:scale-95 cursor-pointer shadow-sm"
            title={language === 'ar' ? 'السابق' : 'Précédent'}
          >
            {isRtl ? <ChevronRight className="w-4 h-4" strokeWidth={1.75} /> : <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />}
          </button>
          <button
            onClick={() => handleScroll(isRtl ? 'left' : 'right')}
            className="w-8 h-8 rounded-xl border border-white/10 bg-[#0E1626] flex items-center justify-center text-slate-300 hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-400 transition-all active:scale-95 cursor-pointer shadow-sm"
            title={language === 'ar' ? 'التالي' : 'Suivant'}
          >
            {isRtl ? <ChevronLeft className="w-4 h-4" strokeWidth={1.75} /> : <ChevronRight className="w-4 h-4" strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {/* Horizontal Scroll Cards Container */}
      <div className="relative max-w-7xl mx-auto group">
        <div 
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto overflow-y-hidden py-2 px-1 scrollbar-none snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {offers.map((offer, index) => (
            <motion.div
              key={offer.id}
              initial={{ opacity: 0, x: isRtl ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileHover={{ y: -3 }}
              onClick={() => setSelectedOffer(offer)}
              className="flex-shrink-0 w-[240px] sm:w-[280px] snap-start border border-white/10 rounded-2xl overflow-hidden cursor-pointer shadow-md hover:shadow-lg hover:border-emerald-500/30 transition-all duration-200 relative bg-[#0E1626]"
            >
              {/* Pulse status indicator badge */}
              <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-md text-[10px] font-bold backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>{language === 'ar' ? 'عرض خاص' : 'Spécial'}</span>
              </div>

              {/* Card Image Area */}
              <div className="w-full aspect-[16/10] relative bg-[#070B14] overflow-hidden shrink-0 border-b border-white/5">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0E1626] via-transparent to-transparent z-10 pointer-events-none" />
                {offer.imageUrl ? (
                  <img 
                    src={offer.imageUrl} 
                    alt={offer.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#070B14]">
                    <MessageCircle className="w-8 h-8 text-emerald-500/30" strokeWidth={1.6} />
                  </div>
                )}
              </div>

              {/* Text content area */}
              <div className={cn("p-3.5 flex flex-col min-h-[90px] justify-between", isRtl ? "text-right" : "text-left")}>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1 mb-1">
                    {offer.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-normal leading-relaxed line-clamp-2 mb-2">
                    {offer.description}
                  </p>
                </div>
                
                {/* Clean inline CTA */}
                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 mt-auto">
                  <span>{language === 'ar' ? 'تفاصيل وتواصل' : 'Détails & Contact'}</span>
                  <Sparkles className="w-3 h-3 text-emerald-400" strokeWidth={1.6} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Preview Modal Popup */}
      {createPortal(
        <AnimatePresence>
          {selectedOffer && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[99999] overflow-y-auto p-4 flex flex-col items-center justify-center min-h-full">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                className="rounded-2xl border border-white/10 max-w-md w-full overflow-hidden relative shadow-2xl bg-[#0E1626] my-auto shrink-0"
              >
                {/* Close Button */}
                <button
                  onClick={() => setSelectedOffer(null)}
                  className="absolute top-3.5 right-3.5 w-8 h-8 bg-[#070B14]/80 border border-white/10 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 z-30 transition-all active:scale-95 cursor-pointer shadow-md"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
                
                {/* Large Image inside Modal */}
                {selectedOffer.imageUrl && (
                  <div className="w-full h-52 sm:h-60 relative bg-[#070B14] border-b border-white/10">
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0E1626] via-transparent to-transparent z-10 pointer-events-none" />
                    <img 
                      src={selectedOffer.imageUrl} 
                      alt={selectedOffer.title} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-md text-[10px] font-bold backdrop-blur-md">
                      <Flame className="w-3 h-3 text-amber-400" strokeWidth={1.6} />
                      <span>{language === 'ar' ? 'عرض حصري نشط' : 'Offre exclusive'}</span>
                    </div>
                  </div>
                )}

                {/* Details and CTA area */}
                <div className="p-5 sm:p-6 text-center">
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2 leading-tight">
                    {selectedOffer.title}
                  </h3>
                  <p className="text-xs text-slate-300 mb-6 leading-relaxed max-h-36 overflow-y-auto px-1 font-normal">
                    {selectedOffer.description}
                  </p>

                  {/* Direct WhatsApp Action Button */}
                  <a
                    href={`https://wa.me/222${OFFICIAL_PHONE}?text=${encodeURIComponent(`السلام عليكم، أريد الاستفسار عن العرض الحصري: ${selectedOffer.title}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs transition-all active:scale-[0.98] shadow-md shadow-emerald-500/20 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 fill-slate-950 text-slate-950" strokeWidth={1.6} />
                    <span>{language === 'ar' ? 'تواصل معنا واطلب العرض عبر واتساب' : 'Profiter de l\'offre sur WhatsApp'}</span>
                  </a>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
