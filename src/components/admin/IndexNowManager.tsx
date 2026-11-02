import React, { useState } from 'react';
import { 
  Globe, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Key, 
  ExternalLink, 
  Sparkles, 
  Layers, 
  Copy, 
  Check, 
  FileText,
  Search,
  Zap,
  Info
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { auth } from '../../lib/firebase';
import { SEOAuditUtility } from './SEOAuditUtility';

interface ServicePreset {
  id: string;
  name: string;
  path: string;
  category: 'primary' | 'service';
}

const PRESET_PATHS: ServicePreset[] = [
  { id: 'home', name: 'الصفحة الرئيسية', path: '/', category: 'primary' },
  { id: 'service-cards', name: 'بطاقات الخدمات والاشتراكات', path: '/service-cards', category: 'primary' },
  { id: 'calculator', name: 'حاسبة الكميات والأسعار', path: '/calculator', category: 'primary' },
  { id: 'contact', name: 'تواصل معنا والدعم', path: '/contact', category: 'primary' },
  { id: 'assistant', name: 'المساعد الذكي', path: '/assistant', category: 'primary' },
  { id: 'freefire', name: 'شحن فري فاير (Free Fire)', path: '/services/freefire', category: 'service' },
  { id: 'pubg', name: 'شحن شدات ببجي (PUBG Mobile)', path: '/services/pubg', category: 'service' },
  { id: 'netflix', name: 'اشتراكات نتفليكس (Netflix)', path: '/services/netflix', category: 'service' },
  { id: 'canva', name: 'اشتراك كانفا برو (Canva Pro)', path: '/services/canva', category: 'service' },
  { id: 'spotify', name: 'اشتراك سبوتيفاي (Spotify)', path: '/services/spotify', category: 'service' },
  { id: 'playstation', name: 'بطاقات بلايستيشن (PlayStation)', path: '/services/playstation', category: 'service' },
  { id: 'steam', name: 'بطاقات ستيم (Steam)', path: '/services/steam', category: 'service' },
  { id: 'googleplay', name: 'بطاقات جوجل بلاي (Google Play)', path: '/services/googleplay', category: 'service' },
  { id: 'apple', name: 'بطاقات أبل آيتونز (Apple iTunes)', path: '/services/apple', category: 'service' },
  { id: 'roblox', name: 'بطاقات روبلوكس (Roblox)', path: '/services/roblox', category: 'service' },
  { id: 'tiktok', name: 'شحن كوينز تيك توك (TikTok Coins)', path: '/services/tiktok', category: 'service' },
];

export function IndexNowManager() {
  const { showToast } = useToast();
  const [activeMode, setActiveMode] = useState<'indexnow' | 'seo-audit'>('indexnow');

  // Use current host origin dynamically to avoid cross-host mismatch errors
  const currentHost = window.location.hostname.includes("vercel.app")
    ? "mauritop-v2-4ozx.vercel.app"
    : "mauritop.com";
  const baseUrl = `https://${currentHost}`;

  const [selectedUrls, setSelectedUrls] = useState<string[]>(PRESET_PATHS.map(p => `${baseUrl}${p.path}`));
  const [customInputUrl, setCustomInputUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const apiKey = 'mauritop2026indexnowkey884729';
  const keyLocation = `${baseUrl}/mauritop2026indexnowkey.txt`;

  const toggleSelectUrl = (url: string) => {
    if (selectedUrls.includes(url)) {
      setSelectedUrls(selectedUrls.filter(u => u !== url));
    } else {
      setSelectedUrls([...selectedUrls, url]);
    }
  };

  const handleSelectAll = () => {
    setSelectedUrls(PRESET_PATHS.map(p => `${baseUrl}${p.path}`));
  };

  const handleDeselectAll = () => {
    setSelectedUrls([]);
  };

  const handleAddCustomUrl = () => {
    if (!customInputUrl.trim()) return;
    let formatted = customInputUrl.trim();
    if (!formatted.startsWith('http')) {
      formatted = `https://mauritop.com${formatted.startsWith('/') ? '' : '/'}${formatted}`;
    }
    if (!selectedUrls.includes(formatted)) {
      setSelectedUrls([...selectedUrls, formatted]);
      showToast('تم إضافة الرابط بنجاح', 'success');
    }
    setCustomInputUrl('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    showToast('تم نسخ مفتاح IndexNow', 'success');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSubmitIndexNow = async () => {
    if (selectedUrls.length === 0) {
      showToast('يرجى تحديد رابط واحد على الأقل لإرسال طلب الفهرسة', 'error');
      return;
    }

    setIsSubmitting(true);
    setLastResponse(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        showToast('يرجى تسجيل الدخول بحساب المالك أولاً', 'error');
        return;
      }
      const idToken = await currentUser.getIdToken();
      // Detect current active host to support both mauritop.com and vercel previews
      const currentHost = window.location.hostname.includes("vercel.app")
        ? "mauritop-v2-4ozx.vercel.app"
        : "mauritop.com";

      const res = await fetch('/api/indexnow/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ urls: selectedUrls, host: currentHost }),
      });

      const data = await res.json();
      if (data.success) {
        setLastResponse(data);
        showToast(`تم إرسال ${data.submittedUrlsCount} رابط لمحركات البحث بنجاح!`, 'success');
      } else if (data.results) {
        setLastResponse(data);
        showToast(data.error || 'تمت معالجة الطلب، يرجى مراجعة تفاصيل استجابة المحركات أدناه', 'info');
      } else {
        showToast(data.error || 'حدث خطأ أثناء إرسال الفهرسة', 'error');
      }
    } catch (err: any) {
      console.error(err);
      showToast('تعذر الاتصال بخدمة الفهرسة الفورية', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900 border border-white/10 w-fit">
        <button
          onClick={() => setActiveMode('indexnow')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeMode === 'indexnow'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>إرسال الروابط (IndexNow)</span>
        </button>

        <button
          onClick={() => setActiveMode('seo-audit')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeMode === 'seo-audit'
              ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>تدقيق ميتاداتا السيو للخدمات (SEO Audit)</span>
        </button>
      </div>

      {activeMode === 'seo-audit' ? (
        <SEOAuditUtility />
      ) : (
        <>
          {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-cyan-950/80 via-slate-900 to-indigo-950/80 border border-cyan-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full filter blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>إرسال الروابط لمحركات تدعم IndexNow</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
              <Search className="w-7 h-7 text-cyan-400 shrink-0" />
              أداة إرسال الفهرسة المباشرة محركات البحث
            </h2>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              تتيح لك هذه الأداة إرسال الروابط إلى الخدمات المتوافقة مع بروتوكول IndexNow مثل Bing. أما فهرسة Google فتتم عبر خريطة الموقع وGoogle Search Console في <span className="text-cyan-300 font-bold">موري توب</span> لتضمينها فوراً في نتائج البحث دون انتظار الزحف التلقائي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={keyLocation}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-200 transition-all flex items-center gap-2"
            >
              <Key className="w-4 h-4 text-amber-400" />
              <span>ملف المفتاح (.txt)</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>

            <a
              href="https://mauritop.com/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-bold text-cyan-300 transition-all flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>خريطة الموقع (Sitemap)</span>
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            </a>
          </div>
        </div>
      </div>

      {/* IndexNow Key Config Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-amber-400" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs text-slate-400 font-medium">مفتاح الموقع العام (IndexNow)</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono font-bold text-amber-300 truncate">{apiKey}</span>
              <button
                onClick={() => copyToClipboard(apiKey)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
                title="نسخ المفتاح"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs text-slate-400 font-medium">المجال الرئيسي (Host Domain)</p>
            <p className="text-xs font-mono font-bold text-cyan-300 mt-1">mauritop.com</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs text-slate-400 font-medium">حالة البروتوكول</p>
            <p className="text-xs font-bold text-emerald-400 mt-1">الإعداد موجود — يلزم اختبار الاتصال</p>
          </div>
        </div>
      </div>

      {/* URL Selector Section */}
      <div className="p-6 rounded-3xl bg-slate-900/90 border border-white/10 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              تحديد الروابط المراد إرسالها للفهرسة
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              تم تحديد ({selectedUrls.length}) رابط من أصل ({PRESET_PATHS.length})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-cyan-300 border border-cyan-500/20 transition-all"
            >
              تحديد الكل
            </button>
            <button
              onClick={handleDeselectAll}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-400 border border-white/10 transition-all"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>

        {/* Custom URL Input Box */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customInputUrl}
            onChange={(e) => setCustomInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCustomUrl()}
            placeholder="أضف رابط فرعي آخر (مثال: /services/netflix)"
            className="flex-1 bg-slate-950 border border-white/15 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          <button
            onClick={handleAddCustomUrl}
            className="px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shrink-0 cursor-pointer"
          >
            إضافة الرابط
          </button>
        </div>

        {/* List of Preset URLs Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {PRESET_PATHS.map((preset) => {
            const fullUrl = `${baseUrl}${preset.path}`;
            const isSelected = selectedUrls.includes(fullUrl);
            return (
              <div
                key={preset.id}
                onClick={() => toggleSelectUrl(fullUrl)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-white shadow-lg shadow-cyan-500/5'
                    : 'bg-slate-950/50 border-white/5 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="overflow-hidden space-y-0.5">
                  <p className={`text-xs font-bold truncate ${isSelected ? 'text-cyan-300' : 'text-slate-300'}`}>
                    {preset.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">{fullUrl}</p>
                </div>

                <div className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                  isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-white/20 bg-slate-900'
                }`}>
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Added URLs if any */}
        {selectedUrls.filter(u => !PRESET_PATHS.some(p => `${baseUrl}${p.path}` === u)).length > 0 && (
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs font-bold text-amber-300 mb-2">الروابط المضافة مخصصاً:</p>
            <div className="space-y-2">
              {selectedUrls
                .filter(u => !PRESET_PATHS.some(p => `${baseUrl}${p.path}` === u))
                .map((u, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-amber-950/20 border border-amber-500/30 rounded-xl p-2.5 px-4 text-xs">
                    <span className="font-mono text-amber-200 truncate">{u}</span>
                    <button
                      onClick={() => toggleSelectUrl(u)}
                      className="text-red-400 hover:text-red-300 text-xs font-bold cursor-pointer"
                    >
                      إزالة
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Submit Action Button */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>سيتم إرسال الروابط إلى IndexNow وBing، مع تذكيرك بإرسال خريطة الموقع إلى Google Search Console بشكل منفصل.</span>
          </div>

          <button
            onClick={handleSubmitIndexNow}
            disabled={isSubmitting || selectedUrls.length === 0}
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-black text-sm transition-all shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-slate-950" />
                <span>جاري إرسال الفهرسة الفورية...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>إرسال الفهرسة الفورية الآن ({selectedUrls.length} رابط)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Response Results Section */}
      {lastResponse && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-emerald-500/30 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">نتيجة إرسال الفهرسة</h4>
                <p className="text-xs text-slate-400">
                  تم التحديث في {new Date(lastResponse.timestamp).toLocaleTimeString('ar-MA')}
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
              نجح الإرسال لـ {lastResponse.submittedUrlsCount} رابط
            </span>
          </div>

          {/* Engine Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* IndexNow.org Status */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">بروتوكول IndexNow.org</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  lastResponse.results?.indexNowOrg?.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {lastResponse.results?.indexNowOrg?.status || 'مكتمل'}
                </span>
              </div>
              <p className="text-xs text-slate-400">{lastResponse.results?.indexNowOrg?.message}</p>
            </div>

            {/* Bing Status */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">محرك بحث Bing</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  lastResponse.results?.bing?.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {lastResponse.results?.bing?.status || 'مكتمل'}
                </span>
              </div>
              <p className="text-xs text-slate-400">{lastResponse.results?.bing?.message}</p>
            </div>

            {/* Google Sitemap Ping Status */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">إرسال خريطة Google</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  lastResponse.results?.googleSitemapPing?.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {lastResponse.results?.googleSitemapPing?.manualRequired ? 'إجراء يدوي' : (lastResponse.results?.googleSitemapPing?.status || 'غير متاح')}
                </span>
              </div>
              <p className="text-xs text-slate-400">{lastResponse.results?.googleSitemapPing?.message}</p>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
