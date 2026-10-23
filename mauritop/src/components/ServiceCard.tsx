import React from 'react';
import { Service } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Clock, Zap, ArrowLeft, ArrowRight } from 'lucide-react';

interface ServiceCardProps {
  service: Service;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service }) => {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const minPrice = service.packages && service.packages.length > 0
    ? service.packages.reduce((min, p) => (p.amount < min ? p.amount : min), service.packages[0]?.amount || 0)
    : service.priceMru || service.suggestedPrice || service.minAmount || 0;

  return (
    <div
      onClick={() => navigate(`/services/${service.id}`)}
      className="glass-card group relative p-5 flex flex-col justify-between transition-all duration-300 cursor-pointer hover:border-emerald-500/50 hover:-translate-y-1 active:scale-[0.98] rounded-3xl"
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#1E2B4B] to-[#151F37] border border-white/10 flex items-center justify-center text-3xl shadow-inner group-hover:scale-105 transition-transform overflow-hidden">
            {service.imageUrl || service.image ? (
              <img src={service.imageUrl || service.image} alt={service.name} className="w-full h-full object-cover" />
            ) : (
              <Zap className="w-6 h-6 text-emerald-400" />
            )}
          </div>

          <div className="flex flex-col items-end gap-1">
            {service.badge && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                {service.badge}
              </span>
            )}
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-400" />
              <span>فوري</span>
            </span>
          </div>
        </div>

        <h3 className="text-lg font-black text-white group-hover:text-emerald-300 transition-colors">
          {language === 'ar' ? (service.nameAr || service.name) : (service.nameFr || service.name)}
        </h3>

        <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
          {language === 'ar' ? (service.descriptionAr || service.description) : (service.descriptionFr || service.description)}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-sm font-black text-emerald-400">{minPrice} MRU</span>
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <span>طلب الخدمة</span>
          {language === 'ar' ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
        </span>
      </div>
    </div>
  );
};

export default ServiceCard;
