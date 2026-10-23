import React, { useEffect, useMemo, useState } from "react";
import { ImageUploader } from "../components/ImageUploader";
import LoadingSpinner from "../components/LoadingSpinner";
import { ServicesManagerSkeleton } from "../components/Skeleton";
import { db, storage } from "../lib/firebase";
import { SERVICES } from "../data/services";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  getDocs,
  deleteDoc,
  runTransaction,
  writeBatch,
  updateDoc
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL, deleteObject, uploadBytes } from "firebase/storage";
import { cacheService } from "../lib/cache";
import {
  Plus,
  Trash2,
  Maximize,
  Minimize,
  ChevronRight,
  Check,
  Settings,
  DollarSign,
  Image as ImageIcon,
  Layout,
  Database,
  Search,
  Eye,
  EyeOff,
  Power,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { isValidImageUrl, cn, compressImage } from "../lib/utils";
import type { Service } from "../types";
import { useToast } from "../contexts/ToastContext";
import { getFallbackServiceImage, resolveServiceImage } from "../lib/serviceImages";
import { persistentImageCache } from "../lib/persistentImageCache";
import { dedupeByStableId, isTestOrDeletedService } from "../lib/serviceUtils";

const REQUIRED_FIELD_OPTIONS = [
  { id: "playerId", label: "Player ID", labelAr: "رقم اللاعب" },
  { id: "email", label: "Email", labelAr: "البريد الإلكتروني" },
  { id: "username", label: "Username", labelAr: "اسم المستخدم" },
  { id: "phone", label: "Phone", labelAr: "رقم الهاتف" },
  { id: "amountMru", label: "Amount (MRU)", labelAr: "المبلغ" },
  { id: "cardId", label: "Card ID", labelAr: "رقم البطاقة" },
  { id: "pageLink", label: "Page Link", labelAr: "رابط الصفحة" },
  { id: "profileLink", label: "Profile Link", labelAr: "رابط الحساب" },
  { id: "objective", label: "Objective", labelAr: "هدف الحملة" },
  { id: "budgetMru", label: "Budget (MRU)", labelAr: "الميزانية" },
  { id: "appleIdEmail", label: "Apple ID Email", labelAr: "بريد Apple ID" },
  { id: "note", label: "Note", labelAr: "ملاحظة" },
];

const CATEGORIES = [
  { id: "games", label: "Games", labelAr: "ألعاب" },
  {
    id: "digital_subs",
    label: "Digital Subscriptions",
    labelAr: "اشتراكات رقمية",
  },
  { id: "gift_cards", label: "Gift Cards", labelAr: "بطاقات الهدايا" },
  { id: "digital_services", label: "Digital Services", labelAr: "خدمات رقمية" },
];

export default function ServicesManager() {
  const { showToast } = useToast();
  const [dbServices, setDbServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [emptySnapshot, setEmptySnapshot] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "general" | "pricing" | "fields" | "appearance"
  >("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState<Partial<Service>>({
    name: "",
    nameAr: "",
    nameFr: "",
    descriptionAr: "",
    descriptionFr: "",
    category: "games",
    imageUrl: "",
    pricingMode: "fixed",
    priceMru: 0,
    minAmountMru: 0,
    maxAmountMru: 0,
    allowCustomAmount: false,
    requiredFields: [],
    quantity: 1,
    status: "active",
    badge: "",
    order: 1,
    imageFit: "cover",
    imagePadding: 0,
  });

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    // 2. Fetch services once
    const fetchServices = async () => {
      const cached = cacheService.get<Service[]>("db_services_admin");
      if (cached && Array.isArray(cached)) {
        // Paint cached data immediately, but never skip the authoritative Firestore read.
        setDbServices(cached);
        setLoading(false);
      }

      try {
        let snapshot = await getDocs(collection(db, "services"));
        console.log(`[ServicesManager] Fetch received. Size: ${snapshot.size}`);
        setFetchError(null);

        // Add only bundled IDs that have no Firestore document at all. Existing documents,
        // including soft-deleted tombstones, are never overwritten or resurrected.
        const existingServiceIds = new Set(snapshot.docs.map((serviceDoc) => serviceDoc.id));
        const missingBundledServices = SERVICES.filter((service) => service?.id && !existingServiceIds.has(String(service.id)));
        if (missingBundledServices.length > 0) {
          const seedBatch = writeBatch(db);
          missingBundledServices.forEach((service, missingIndex) => {
            const serviceData: Record<string, any> = {
              ...service,
              id: service.id,
              name: service.name || service.nameAr || service.id,
              nameAr: service.nameAr || service.name || service.id,
              nameFr: service.nameFr || service.name || service.id,
              description: service.description || service.descriptionAr || "",
              descriptionAr: service.descriptionAr || service.description || "",
              descriptionFr: service.descriptionFr || service.description || "",
              image: service.image || service.imageUrl || "",
              imageUrl: service.imageUrl || service.image || "",
              priceMru: Number(service.priceMru ?? service.suggestedPrice ?? service.minAmountMru ?? service.minAmount ?? 0),
              requiredFields: service.requiredFields || [],
              optionalFields: service.optionalFields || [],
              fields: service.fields || [],
              packages: service.packages || [],
              status: service.status || "active",
              imageFit: service.imageFit || "cover",
              imagePadding: Number(service.imagePadding || 0),
              order: Number(service.order ?? existingServiceIds.size + missingIndex + 1),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            Object.keys(serviceData).forEach((key) => serviceData[key] === undefined && delete serviceData[key]);
            seedBatch.set(doc(db, "services", String(service.id)), serviceData, { merge: true });
          });
          await seedBatch.commit();
          snapshot = await getDocs(collection(db, "services"));
        }

        setEmptySnapshot(snapshot.empty);
        if (snapshot.empty) {
          setDbServices([]);
          cacheService.remove("db_services_admin");
          cacheService.remove("db_services");
            setLoading(false);
          return;
        }

        const loadedDb: Service[] = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (!data) return;
          const svcItem = { id: doc.id, ...data } as Service;
          // تصفية أي بيانات تجريبية أو محذوفة فور الجلب من Firestore
          if (!isTestOrDeletedService(svcItem)) {
            loadedDb.push(svcItem);
          }
        });

        const sorted = loadedDb.sort(
          (a, b) => (a.order || 0) - (b.order || 0),
        );
        // تطبيق دالة dedupeByStableId على البيانات المجلوبة للتأكد من انعدام أي تكرار
        const dedupedDb = dedupeByStableId(sorted);
        setDbServices(dedupedDb);
        cacheService.set("db_services_admin", dedupedDb);
        cacheService.set("db_services", dedupedDb);
        setLoading(false);
      } catch (error: any) {
        console.error("[ServicesManager] Fetch error:", error);
        setFetchError(error.message || String(error));
        showToast("فشل في تحميل الخدمات من Firestore", "error");
        setLoading(false);
      }
    };

    fetchServices();
    const interval = setInterval(fetchServices, 1000 * 60 * 30); // Poll every 30 minutes
    return () => clearInterval(interval);
  }, []);

  // Firestore is the single source of truth. Static catalog data is seeded once into
  // the existing services collection only when that collection has never been seeded.
  const allServices = useMemo(() => {
    const sourceList: Service[] = dbServices.map((dbS) => {
      const { resolvedImage, resolvedImageUrl } = resolveServiceImage(dbS);
      return {
        ...dbS,
        image: resolvedImage,
        imageUrl: resolvedImageUrl,
        priceMru: Number(dbS.priceMru ?? (dbS as any).price ?? 0),
        imageFit: dbS.imageFit || "cover",
        imagePadding: dbS.imagePadding !== undefined ? Number(dbS.imagePadding) : 0,
        status: dbS.status || "نشط",
        fields: dbS.fields || [],
        packages: dbS.packages || [],
      } as Service;
    });

    return dedupeByStableId(sourceList);
  }, [dbServices]);

  const handleEdit = (service: Service) => {
    setSelectedService(service);
    setFormData(service);
    setIsEditing(true);
    setActiveTab("general");
  };

  const handleCreateNew = () => {
    setSelectedService(null);
    setFormData({
      name: "",
      nameAr: "",
      nameFr: "",
      descriptionAr: "",
      descriptionFr: "",
      category: "games",
      imageUrl: "",
      pricingMode: "fixed",
      priceMru: 0,
      minAmountMru: 0,
      maxAmountMru: 0,
      allowCustomAmount: false,
      requiredFields: [],
      quantity: 1,
      status: "active",
      badge: "",
      order: allServices.length + 1,
      imageFit: "cover",
      imagePadding: 0,
    });
    setIsEditing(true);
    setActiveTab("general");
  };

  const handleImageUpload = async (blob: Blob) => {
    try {
      setUploadProgress(10);
      
      // Convert Blob to Base64
      const rawBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(new Error("File read error"));
        reader.readAsDataURL(blob);
      });
      
      setUploadProgress(40);
      
      // Compress image for optimal size and fast saving
      const compressedBase64 = await compressImage(rawBase64, 600, 600, 0.7);
      
      setFormData(prev => ({ ...prev, imageUrl: compressedBase64, image: compressedBase64 }));
      setUploadProgress(100);
      showToast("تم اختيار الصورة وتحسينها بنجاح (احفظ التغييرات للتطبيق)", "success");
      
      setTimeout(() => setUploadProgress(0), 400);
    } catch (err) {
      console.error("Image upload error:", err);
      showToast("فشل معالجة الصورة: " + (err as Error).message, "error");
      setUploadProgress(0);
    }
  };

  const saveService = async () => {
    console.log("saveService called, formData:", formData);
    if (!formData.nameAr || !formData.nameFr) {
      showToast("يرجى إدخال اسم الخدمة بالعربية والفرنسية", "error");
      return;
    }

    const id = selectedService?.id || doc(collection(db, "services")).id;
    let finalImageUrl = formData.imageUrl !== undefined ? formData.imageUrl : (formData.image !== undefined ? formData.image : "");

    try {
      setLoading(true);

      // Store service images in Storage, not inside Firestore documents. Base64 fallback
      // can inflate documents past Firestore's 1 MiB limit and slow every service query.
      if (finalImageUrl && finalImageUrl.startsWith("data:")) {
        const compressedBase64 = await compressImage(finalImageUrl, 600, 600, 0.7);
        const imageId = selectedService?.id || id;
        const imageRef = ref(storage, `services/${imageId}_${Date.now()}.webp`);
        await uploadString(imageRef, compressedBase64, "data_url");
        finalImageUrl = await getDownloadURL(imageRef);
        if (!finalImageUrl || finalImageUrl.startsWith("data:")) {
          throw new Error("تعذر حفظ الصورة في التخزين السحابي؛ لم يتم حفظ الخدمة لتجنب تخزين صورة كبيرة داخل قاعدة البيانات.");
        }
      }

      const maxOrder = allServices.length > 0 ? Math.max(...allServices.map(s => s.order || 0)) : 0;
      const parsedOrder = Number(formData.order);
      const orderVal = (formData.order === undefined || formData.order === null || isNaN(parsedOrder) || parsedOrder <= 0)
        ? maxOrder + 1
        : parsedOrder;

      const finalData = {
        ...formData,
        order: orderVal,
        imageUrl: finalImageUrl,
        image: finalImageUrl,
        id,
        updatedAt: serverTimestamp(),
        createdAt: selectedService
          ? (selectedService as any).createdAt || serverTimestamp()
          : serverTimestamp(),
      };

      // Strip out any undefined values to prevent Firestore payload crashes
      const cleanData: any = {};
      Object.entries(finalData).forEach(([key, val]) => {
        if (val !== undefined) {
          cleanData[key] = val;
        }
      });

      await setDoc(doc(db, "services", id), cleanData);
      
      // Persist custom image into durable IndexedDB and Service Worker cache
      if (finalImageUrl) {
        persistentImageCache.saveServiceImage(id, finalImageUrl);
      }
      
      // Update local state immediately so UI updates instantly without requiring page refresh
      setDbServices((prev) => {
        const index = prev.findIndex((s) => s.id === id);
        const updatedItem = {
          ...cleanData,
          updatedAt: new Date(),
        } as Service;
        if (index >= 0) {
          const next = [...prev];
          next[index] = updatedItem;
          return next;
        } else {
          return [updatedItem, ...prev];
        }
      });

      // Invalidate all related caches to ensure the UI updates instantly everywhere
      cacheService.remove("db_services");
      cacheService.remove("db_services_admin");
      cacheService.remove("featured_services");
      
      showToast(selectedService ? "تم تحديث الخدمة بنجاح" : "تمت إضافة الخدمة بنجاح", "success");
      setIsEditing(false);
    } catch (error: any) {
      console.error("Save error:", error);
      showToast(`فشل في الحفظ: ${error.message || "خطأ غير معروف"}`, "error");
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;
    const id = serviceToDelete.id;
    setIsDeleting(true);
    try {
      const previousRecordUrl = serviceToDelete.imageUrl || serviceToDelete.image;

      // Persist the tombstone first. Never delete the image before the catalogue update
      // succeeds, otherwise a failed Firestore write would leave a live service with a broken image.
      await setDoc(
        doc(db, "services", id),
        {
          status: "deleted",
          isDeleted: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (previousRecordUrl && previousRecordUrl.includes("firebasestorage.googleapis.com")) {
        try {
          const oldImageRef = ref(storage, previousRecordUrl);
          await deleteObject(oldImageRef);
        } catch (e) {
          // The service is already marked deleted; an orphaned old image is safer than
          // reversing the successful catalogue operation or showing a false failure.
          console.warn("Old image cleanup skipped:", e);
        }
      }

      // Update local state immediately so user sees it gone instantly
      setDbServices((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        return [...filtered, { id, status: "deleted", isDeleted: true } as any];
      });

      // Invalidate all related caches to ensure the UI updates instantly everywhere
      cacheService.remove("db_services");
      cacheService.remove("db_services_admin");
      cacheService.remove("featured_services");

      showToast(
        `تم حذف خدمة "${serviceToDelete.nameAr || serviceToDelete.name}" بنجاح`,
        "success"
      );
      setServiceToDelete(null);
    } catch (error: any) {
      console.error("Delete service error:", error);
      showToast(`فشل في حذف الخدمة: ${error.message || "خطأ غير متوقع"}`, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteService = (service: Service) => {
    setServiceToDelete(service);
  };

  const moveService = async (service: Service, direction: 'up' | 'down') => {
    // Find position of the service in the visible list (filteredServices)
    const visibleIdx = filteredServices.findIndex((s) => s.id === service.id);
    if (visibleIdx === -1) return;

    let targetVisibleIdx = direction === 'up' ? visibleIdx - 1 : visibleIdx + 1;
    if (targetVisibleIdx < 0 || targetVisibleIdx >= filteredServices.length) return;

    const targetService = filteredServices[targetVisibleIdx];

    // Find their positions in the full unfiltered services array
    const idx = allServices.findIndex((s) => s.id === service.id);
    const targetIdx = allServices.findIndex((s) => s.id === targetService.id);
    if (idx === -1 || targetIdx === -1) return;

    // Get current order values or assign them based on position
    let currentOrder = (service.order !== undefined && service.order !== null) ? Number(service.order) : (idx + 1);
    let targetOrder = (targetService.order !== undefined && targetService.order !== null) ? Number(targetService.order) : (targetIdx + 1);

    // Swap order values. If they are the same, assign distinct sequential ones
    if (currentOrder === targetOrder) {
      currentOrder = idx + 1;
      targetOrder = targetIdx + 1;
    }

    try {
      const batch = writeBatch(db);
      
      // Use set with merge to support default services not yet initialized in DB
      batch.set(doc(db, 'services', service.id), { order: targetOrder }, { merge: true });
      batch.set(doc(db, 'services', targetService.id), { order: currentOrder }, { merge: true });

      // Optimistic UI state update to prevent any frozen/delayed states or hanging
      const updatedDbServices = [...dbServices];
      
      const updateOrAdd = (svcId: string, orderVal: number) => {
        const dbIdx = updatedDbServices.findIndex(s => s.id === svcId);
        if (dbIdx !== -1) {
          updatedDbServices[dbIdx] = { ...updatedDbServices[dbIdx], order: orderVal };
        } else {
          const original = allServices.find(s => s.id === svcId);
          if (original) {
            updatedDbServices.push({ ...original, order: orderVal });
          }
        }
      };

      updateOrAdd(service.id, targetOrder);
      updateOrAdd(targetService.id, currentOrder);
      setDbServices(updatedDbServices);

      await batch.commit();

      // Invalidate all related caches to ensure the UI updates instantly everywhere
      cacheService.remove("db_services");
      cacheService.remove("db_services_admin");
      cacheService.remove("featured_services");
      
      showToast("تم ترتيب الخدمة بنجاح", "success");
    } catch (error) {
      showToast("فشل في ترتيب الخدمة", "error");
      console.error(error);
    }
  };

  const toggleField = (fieldId: string) => {
    const currentReq = formData.requiredFields || [];
    const currentOpt = formData.optionalFields || [];
    
    if (currentReq.includes(fieldId)) {
      setFormData({
        ...formData,
        requiredFields: currentReq.filter((id) => id !== fieldId),
      });
    } else {
      setFormData({ 
        ...formData, 
        requiredFields: [...currentReq, fieldId],
        optionalFields: currentOpt.filter(id => id !== fieldId) // Remove from optional if adding to required
      });
    }
  };

  const toggleOptionalField = (fieldId: string) => {
    const currentOpt = formData.optionalFields || [];
    const currentReq = formData.requiredFields || [];
    
    if (currentOpt.includes(fieldId)) {
      setFormData({
        ...formData,
        optionalFields: currentOpt.filter((id) => id !== fieldId),
      });
    } else {
      setFormData({ 
        ...formData, 
        optionalFields: [...currentOpt, fieldId],
        requiredFields: currentReq.filter((id) => id !== fieldId) // Remove from required if adding to optional
      });
    }
  };

  const toggleServiceStatus = async (service: Service) => {
    const isSvcActive = (service.status === "active" || service.status === "نشط");
    const newStatus = isSvcActive ? "inactive" : "active";

    try {
      await setDoc(doc(db, "services", service.id), { status: newStatus, updatedAt: serverTimestamp() }, { merge: true });

      // Update local dbServices state optimistically so UI updates instantly
      setDbServices(prev => {
        const dbIdx = prev.findIndex(s => s.id === service.id);
        if (dbIdx !== -1) {
          const updated = [...prev];
          updated[dbIdx] = { ...updated[dbIdx], status: newStatus as any };
          return updated;
        } else {
          const orig = allServices.find(s => s.id === service.id);
          return [...prev, { ...(orig || service), status: newStatus as any }];
        }
      });

      // Invalidate all related caches
      cacheService.remove("db_services");
      cacheService.remove("db_services_admin");
      cacheService.remove("featured_services");

      showToast(
        newStatus === "active" 
          ? `تم تفعيل خدمة "${service.nameAr || service.name}" بنجاح` 
          : `تم إخفاء خدمة "${service.nameAr || service.name}" بنجاح`, 
        "success"
      );
    } catch (err: any) {
      console.error("Toggle status error:", err);
      showToast("فشل في تعديل حالة الخدمة", "error");
    }
  };

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = allServices.filter((s) => {
      // Status filter
      const isSvcActive = (s.status === "active" || s.status === "نشط");
      if (selectedStatusFilter === "active" && !isSvcActive) return false;
      if (selectedStatusFilter === "inactive" && isSvcActive) return false;

      // Category filter
      if (selectedCategoryFilter !== "all" && s.category !== selectedCategoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.name?.toLowerCase().includes(q) ||
        s.nameAr?.toLowerCase().includes(q) ||
        s.nameFr?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.categoryAr?.toLowerCase().includes(q) ||
        s.categoryFr?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q)
      );
    });
    console.log(`[ServicesManager] Filtered services (searchQuery="${searchQuery}", category="${selectedCategoryFilter}", status="${selectedStatusFilter}") count: ${result.length}/${allServices.length}`);
    
    return result.sort((a, b) => {
      const orderA = a.order ?? 9999;
      const orderB = b.order ?? 9999;
      return orderA - orderB;
    });
  }, [allServices, searchQuery, selectedCategoryFilter, selectedStatusFilter]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            إدارة الخدمات
          </h2>
          <p className="mt-1 text-slate-500 font-bold">
            تحكم كامل في الخدمات والأسعار.
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-6 py-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-cyan-600/10 active:scale-95"
        >
          <Plus size={20} />
          إضافة خدمة جديدة
        </button>
      </div>

      {/* DB Status Indicators */}
      {fetchError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 animate-in fade-in duration-300">
          <AlertCircle className="shrink-0 mt-0.5 text-red-600" size={18} />
          <div className="text-xs font-bold">
            <p className="font-black">خطأ في جلب البيانات من قاعدة البيانات:</p>
            <p className="mt-1 font-mono">{fetchError}</p>
          </div>
        </div>
      )}

      {emptySnapshot && !fetchError && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 animate-in fade-in duration-300">
          <AlertCircle className="shrink-0 mt-0.5 text-amber-600" size={18} />
          <div className="text-xs font-bold">
            <p className="font-black">تنبيه: قاعدة البيانات فارغة</p>
            <p className="mt-1">لم يتم العثور على أي مستندات في مجموعة الخدمات (services) على Firestore. سيتم استخدام الإعدادات الافتراضية للخدمات المدمجة فقط.</p>
          </div>
        </div>
      )}

      {isEditing ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Top Sticky Header for Service Editing */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 md:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="رجوع للقائمة"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div>
                <h3 className="text-base md:text-lg font-black text-slate-800 leading-tight">
                  {selectedService ? `تعديل خدمة: ${formData.nameAr || formData.name}` : "إضافة خدمة جديدة"}
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  قم بتعديل بيانات الخدمة والأسعار والمظهر ثم اضغط حفظ التغييرات.
                </p>
              </div>
            </div>

            {/* Action Buttons in Header */}
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0">
              <button
                onClick={() => {
                  console.log("Save button clicked, formData:", formData);
                  saveService();
                }}
                disabled={loading || uploadProgress > 0}
                className={cn(
                  "w-full sm:w-auto px-6 py-3.5 text-white rounded-2xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 order-1 sm:order-2",
                  (loading || uploadProgress > 0)
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 active:scale-95"
                )}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    <span>حفظ التغييرات</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                disabled={loading}
                className="w-full sm:w-auto px-5 py-3.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-2xl font-black text-xs border border-slate-200/80 transition-all cursor-pointer shrink-0 order-2 sm:order-1"
              >
                إلغاء التعديل
              </button>
            </div>
          </div>

          {/* Progress Indicator */}
          {uploadProgress > 0 && (
            <div className="bg-cyan-50 border border-cyan-200 p-4 rounded-2xl">
              <div className="flex justify-between text-xs font-black text-cyan-700 mb-2">
                <span>جاري معالجة الصورة...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-cyan-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-cyan-600 transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Horizontal Scrollable Tabs */}
          <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200 overflow-x-auto scrollbar-none">
            {[
              { id: "general", label: "المعلومات العامة", icon: Layout },
              { id: "pricing", label: "نظام التسعير", icon: DollarSign },
              { id: "fields", label: "الحقول المطلوبة", icon: Database },
              { id: "appearance", label: "المظهر والصورة", icon: ImageIcon },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 rounded-xl transition-all font-black text-xs whitespace-nowrap cursor-pointer shrink-0",
                  activeTab === tab.id
                    ? "bg-white text-cyan-700 shadow-sm border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                )}
              >
                <tab.icon size={16} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Form Content Card */}
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-5 md:p-8 shadow-sm">
            {activeTab === "general" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      الاسم بالعربية
                    </label>
                    <input
                      type="text"
                      value={formData.nameAr || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          nameAr: e.target.value,
                          name: e.target.value,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-bold"
                      placeholder="ببجي موبايل - شحن شدات"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      الاسم بالفرنسية/الإنجليزية
                    </label>
                    <input
                      type="text"
                      value={formData.nameFr || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nameFr: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-bold"
                      placeholder="PUBG Mobile UC"
                    />
                  </div>
                </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        الفئة
                      </label>
                      <select
                        value={formData.category || "games"}
                        onChange={(e) =>
                          setFormData({ ...formData, category: e.target.value })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-black select-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option
                            key={cat.id}
                            value={cat.id}
                            className="bg-white"
                          >
                            {cat.labelAr}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        ترتيب الظهور (رقم)
                      </label>
                      <input
                        type="number"
                        value={formData.order ?? ""}
                        onChange={(e) =>
                          setFormData({ ...formData, order: e.target.value === "" ? "" as any : Number(e.target.value) })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-bold"
                        placeholder="مثال: 1"
                      />
                    </div>
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      الوصف بالعربية
                    </label>
                    <textarea
                      value={formData.descriptionAr || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          descriptionAr: e.target.value,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-bold min-h-[120px]"
                      placeholder="وصف مختصر للخدمة..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      الوصف بالفرنسية
                    </label>
                    <textarea
                      value={formData.descriptionFr || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          descriptionFr: e.target.value,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-bold min-h-[120px]"
                      placeholder="Description en français..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      الحالة
                    </label>
                    <select
                      value={formData.status || "active"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-black"
                    >
                      <option value="active" className="bg-white">
                        نشط (Active)
                      </option>
                      <option value="inactive" className="bg-white">
                        غير نشط (Inactive)
                      </option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      وسم مميز (Badge)
                    </label>
                    <input
                      type="text"
                      value={formData.badge || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, badge: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-bold"
                      placeholder="جديد، عرض محدود..."
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "pricing" && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      مود التسعير (Pricing Mode)
                    </label>
                    <select
                      value={formData.pricingMode || "fixed"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          pricingMode: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-black"
                    >
                      <option value="fixed" className="bg-white">
                        سعر ثابت (Fixed)
                      </option>
                      <option value="range" className="bg-white">
                        نطاق مبالغ (Range)
                      </option>
                      <option value="custom" className="bg-white">
                        مبلغ حر (Custom)
                      </option>
                      <option value="quote" className="bg-white">
                        طلب عرض سعر (Quote)
                      </option>
                    </select>
                  </div>

                  {(formData.pricingMode === "fixed" ||
                    formData.pricingMode === "custom") && (
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        السعر الأساسي (MRU)
                      </label>
                      <input
                        type="number"
                        value={formData.priceMru ?? 0}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            priceMru: Number(e.target.value),
                          })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-cyan-600 outline-none focus:border-cyan-500/50 transition-all font-black text-xl"
                      />
                    </div>
                  )}
                </div>

                {formData.pricingMode === "range" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-50 rounded-3xl border border-slate-200">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        الحد الأدنى (Min)
                      </label>
                      <input
                        type="number"
                        value={formData.minAmountMru ?? 0}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            minAmountMru: Number(e.target.value),
                          })
                        }
                        className="w-full bg-white rounded-xl px-5 py-3 text-slate-800 border border-slate-200 outline-none focus:border-cyan-500/50 font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        الحد الأقصى (Max)
                      </label>
                      <input
                        type="number"
                        value={formData.maxAmountMru ?? 0}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxAmountMru: Number(e.target.value),
                          })
                        }
                        className="w-full bg-white rounded-xl px-5 py-3 text-slate-800 border border-slate-200 outline-none focus:border-cyan-500/50 font-bold"
                      />
                    </div>
                  </div>
                )}

                <div className="p-6 bg-cyan-50 border border-cyan-100 rounded-3xl flex items-start gap-4">
                  <AlertCircle
                    className="text-cyan-600 shrink-0 mt-1"
                    size={20}
                  />
                  <div className="text-sm">
                    <h4 className="text-cyan-700 font-black mb-1 text-right">
                      ملاحظة حول نظام المبالغ:
                    </h4>
                    <p className="text-slate-600 font-bold leading-relaxed text-right">
                      - في حال اختيار "نطاق مبالغ"، سيظهر للمستخدم حقل رقمي بين القيمة الصغرى والكبرى.
                      <br />
                      - في حال "مبلغ حر"، يمكن للمستخدم كتابة أي مبلغ يريده.
                      <br />- "طلب عرض سعر" يخفي المبالغ ويجعلها 0 مؤقتاً لحين مراجعة الإدارة.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "fields" && (
              <div className="space-y-6 text-right">
                <h3 className="text-lg font-black text-slate-800">
                  خيارات إضافية:
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-cyan-50 border border-cyan-100 rounded-2xl flex items-center justify-between">
                    <div className="text-right">
                      <h4 className="font-bold text-cyan-700">تتطلب كود تفعيل (PIN)</h4>
                      <p className="text-[10px] text-slate-500 mt-1">إذا تم التفعيل، سيظهر حقل لإدخال الكود عند اكتمال الطلب وسيعرض للمستخدم.</p>
                    </div>
                    <button
                      onClick={() => setFormData({ ...formData, requiresCode: !formData.requiresCode })}
                      className={cn(
                        "w-12 h-6 rounded-full transition-colors relative shrink-0",
                        formData.requiresCode ? "bg-cyan-600" : "bg-slate-300"
                      )}
                    >
                      <span className={cn(
                        "absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform",
                        formData.requiresCode ? "translate-x-6" : "translate-x-0"
                      )} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-lg font-black text-slate-800 mt-8">
                  اختر الحقول المطلوبة:
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {REQUIRED_FIELD_OPTIONS.map((field) => {
                    const isSelected = formData.requiredFields?.includes(
                      field.id,
                    );
                    const isOptional = formData.optionalFields?.includes(
                      field.id,
                    );
                    return (
                      <div key={field.id} className="flex gap-1 relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => toggleField(field.id)}
                          className={cn(
                            "flex-1 flex flex-col items-start px-4 py-3 transition-all text-right",
                            isSelected
                              ? "bg-cyan-100 text-cyan-700 font-black shadow-[inset_2px_0_0_0_#0891b2]"
                              : "text-slate-500 hover:bg-slate-100 font-bold",
                          )}
                        >
                          <span className="text-sm">{field.labelAr} (إجباري)</span>
                          <span className="text-[9px] opacity-60 uppercase">{field.label}</span>
                        </button>
                        
                        <div className="w-[1px] bg-slate-200 my-2"></div>
                        
                        <button
                          type="button"
                          onClick={() => toggleOptionalField(field.id)}
                          className={cn(
                            "flex border-r border-slate-200 flex-col items-center justify-center px-3 py-3 transition-all",
                            isOptional
                              ? "bg-amber-100 text-amber-700 font-black"
                              : "text-slate-400 hover:bg-slate-100 font-bold",
                          )}
                        >
                          <span className="text-[10px] whitespace-nowrap">اختياري</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="space-y-8 text-right">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <ImageUploader
                      onFileSelected={handleImageUpload}
                      onImageSelected={(base64) =>
                        setFormData((prev) => ({
                          ...prev,
                          imageUrl: base64,
                          image: base64,
                        }))
                      }
                      initialPreview={formData.imageUrl || formData.image}
                      label="تحميل صورة الخدمة"
                      imageFit={formData.imageFit}
                      aspect={16/11}
                    />

                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">
                        أو رابط الصورة المباشر (URL)
                      </label>
                      <input
                        type="url"
                        value={formData.imageUrl || formData.image || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            imageUrl: e.target.value,
                            image: e.target.value,
                          }))
                        }
                        placeholder="https://example.com/image.png"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-800 font-bold outline-none focus:border-cyan-500/50 transition-all text-left ltr"
                      />
                      {selectedService && SERVICES.some((s) => s.id === selectedService.id) && (
                        <button
                          type="button"
                          onClick={() => {
                            const defaultStatic = SERVICES.find((s) => s.id === selectedService.id);
                            const defaultImg = defaultStatic?.imageUrl || defaultStatic?.image || "";
                            setFormData((prev) => ({
                              ...prev,
                              imageUrl: defaultImg,
                              image: defaultImg,
                            }));
                            showToast("تمت استعادة الصورة الافتراضية للخدمة", "info");
                          }}
                          className="text-xs font-bold text-cyan-600 hover:text-cyan-700 hover:underline flex items-center gap-1.5 mt-2"
                        >
                          <RotateCcw size={13} />
                          <span>استعادة الصورة الافتراضية لهذه الخدمة</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        نمط الصورة (Image Fit)
                      </label>
                      <select
                        value={formData.imageFit}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            imageFit: e.target.value as any,
                          })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-800 outline-none focus:border-cyan-500/50 transition-all font-black"
                      >
                        <option value="cover" className="bg-white">
                          غطاء (Cover)
                        </option>
                        <option value="contain" className="bg-white">
                          احتواء (Contain)
                        </option>
                      </select>
                    </div>

                    <div className="space-y-3 bg-slate-50 p-6 rounded-3xl border border-slate-200">
                      <div className="flex justify-between text-xs font-black text-slate-500 mb-2">
                        <span>هامش الصورة:</span>
                        <span className="text-cyan-600">
                          {formData.imagePadding}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        step="2"
                        value={formData.imagePadding}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            imagePadding: Number(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Sticky/Prominent Save Bar for all tabs */}
            <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/80 -mx-5 -mb-5 md:-mx-8 md:-mb-8 p-5 md:p-6 rounded-b-[2.5rem]">
              <div className="flex items-center gap-2.5 text-xs text-slate-600 font-bold">
                <Check size={18} className="text-emerald-600 shrink-0" />
                <span>اضغط "حفظ صورة الخدمة والتغييرات" للتأكيد وتحديث الخدمة فوراً على المنصة.</span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={loading}
                  className="w-full sm:w-auto px-5 py-3.5 bg-white hover:bg-slate-100 text-slate-700 rounded-2xl font-black text-xs border border-slate-200 transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => saveService()}
                  disabled={loading || uploadProgress > 0}
                  className={cn(
                    "w-full sm:w-auto px-8 py-3.5 text-white rounded-2xl font-black text-xs shadow-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer shrink-0 active:scale-95",
                    (loading || uploadProgress > 0)
                      ? "bg-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 ring-2 ring-emerald-500/20"
                  )}
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>حفظ صورة الخدمة والتغييرات الآن</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* List Header / Filters */}
          <div className="mb-8 flex flex-col gap-5">
            <div className="relative flex-1 group">
              <Search
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors"
                size={20}
              />
              <input
                type="text"
                placeholder="ابحث عن اسم الخدمة أو الفئة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl pr-12 pl-5 py-4 text-slate-800 outline-none focus:border-cyan-500/30 transition-all font-bold placeholder-slate-400 shadow-sm"
              />
            </div>

            {/* Category & Status Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Category Pills */}
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setSelectedCategoryFilter("all")}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap border",
                    selectedCategoryFilter === "all"
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  الكل ({allServices.length})
                </button>
                {CATEGORIES.map((cat) => {
                  const count = allServices.filter(s => s.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategoryFilter(cat.id)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap border",
                        selectedCategoryFilter === cat.id
                          ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {cat.labelAr} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  onClick={() => setSelectedStatusFilter("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                    selectedStatusFilter === "all"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  الكل
                </button>
                <button
                  onClick={() => setSelectedStatusFilter("active")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1",
                    selectedStatusFilter === "active"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-emerald-700"
                  )}
                >
                  <Eye size={12} />
                  نشط ({allServices.filter(s => s.status === "active" || s.status === "نشط").length})
                </button>
                <button
                  onClick={() => setSelectedStatusFilter("inactive")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1",
                    selectedStatusFilter === "inactive"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-amber-700"
                  )}
                >
                  <EyeOff size={12} />
                  مخفي ({allServices.filter(s => s.status !== "active" && s.status !== "نشط").length})
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <ServicesManagerSkeleton />
          ) : filteredServices.length === 0 ? (
            <div className="p-20 text-center border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/50">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Database className="text-slate-400" size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800">
                لم يتم العثور على أي خدمات
              </h3>
              <button
                onClick={handleCreateNew}
                className="mt-8 px-8 py-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-2xl font-black transition-all"
              >
                إضافة خدمة جديدة
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredServices.map((service) => {
                const catInfo = CATEGORIES.find(c => c.id === service.category);
                const isActive = service.status === "active" || service.status === "نشط";
                return (
                  <div
                    key={service.id}
                    className={cn(
                      "bg-white border rounded-[2rem] overflow-hidden group shadow-sm hover:shadow-md transition-all duration-300 flex flex-col relative",
                      isActive ? "border-slate-200" : "border-amber-300/80 bg-amber-50/20"
                    )}
                  >
                    {/* Image Area */}
                    <div className="aspect-[16/10] bg-slate-50 relative overflow-hidden border-b border-slate-100 flex-shrink-0">
                      {service.imageUrl || service.image ? (
                        <img
                          src={service.imageUrl || service.image!}
                          className={cn(
                            "w-full h-full transition-transform duration-700 group-hover:scale-105",
                            service.imageFit === "contain"
                              ? "object-contain"
                              : "object-cover",
                            !isActive && "grayscale opacity-80"
                          )}
                          style={{ padding: `${service.imagePadding || 0}px` }}
                          alt={service.nameAr}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (!target.dataset.failed) {
                              target.dataset.failed = 'true';
                              target.src = getFallbackServiceImage(service.nameAr || service.name || '', service.id);
                            } else {
                              target.style.display = 'none';
                            }
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <ImageIcon size={40} />
                        </div>
                      )}

                      {/* Status Badges - Clickable Quick Toggle */}
                      <div className="absolute top-4 right-4 flex flex-col gap-1.5 items-end">
                        <button
                          type="button"
                          onClick={() => toggleServiceStatus(service)}
                          title="انقر لتبديل حالة الخدمة (تفعيل/إخفاء)"
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-md shadow-sm border transition-all hover:scale-105 active:scale-95 flex items-center gap-1 cursor-pointer",
                            isActive
                              ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/30 hover:bg-emerald-100"
                              : "bg-amber-500/10 text-amber-800 border-amber-500/30 hover:bg-amber-100"
                          )}
                        >
                          {isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                          <span>{isActive ? "نشط" : "مخفي"}</span>
                        </button>
                        {service.badge && (
                          <span className="px-3 py-1 rounded-full text-[9px] font-black bg-amber-500 text-white shadow-sm">
                            {service.badge}
                          </span>
                        )}
                      </div>

                      {/* Category Label */}
                      <div className="absolute bottom-3 right-3">
                        <span className="px-3 py-1 rounded-xl text-[10px] font-black bg-slate-900/80 text-white backdrop-blur-sm shadow-sm">
                          {catInfo?.labelAr || service.category}
                        </span>
                      </div>
                    </div>

                    {/* Content Area */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div className="mb-4">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h3 className="text-base font-black text-slate-800 line-clamp-1 leading-tight text-right">
                            {service.nameAr}
                          </h3>
                          <div className="text-left shrink-0 font-mono">
                            <span className="text-base font-black text-cyan-600">
                              {service.pricingMode === "quote"
                                ? "عقد"
                                : service.priceMru}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold mr-1">
                              MRU
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider text-right">
                          {service.nameFr}
                        </p>
                        {service.descriptionAr && (
                          <p className="mt-1.5 text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed text-right">
                            {service.descriptionAr}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleEdit(service)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-black text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Settings size={14} />
                          <span>تعديل</span>
                        </button>

                        {/* Quick Active / Inactive Toggle */}
                        <button
                          type="button"
                          onClick={() => toggleServiceStatus(service)}
                          className={cn(
                            "flex items-center justify-center p-2.5 rounded-xl transition-all border active:scale-95 cursor-pointer shrink-0",
                            isActive 
                              ? "bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white border-amber-200" 
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border-emerald-200"
                          )}
                          title={isActive ? "إخفاء الخدمة" : "تفعيل الخدمة"}
                        >
                          {isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>

                        {/* Sort Up */}
                        <button
                          type="button"
                          onClick={() => moveService(service, 'up')}
                          className="flex items-center justify-center p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 active:scale-95 rounded-xl transition-all border border-slate-200 cursor-pointer shrink-0"
                          title="تحريك للأعلى"
                        >
                          <ArrowUp size={15} />
                        </button>
                        
                        {/* Sort Down */}
                        <button
                          type="button"
                          onClick={() => moveService(service, 'down')}
                          className="flex items-center justify-center p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 active:scale-95 rounded-xl transition-all border border-slate-200 cursor-pointer shrink-0"
                          title="تحريك للأسفل"
                        >
                          <ArrowDown size={15} />
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => deleteService(service)}
                          className="flex items-center justify-center p-2.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white active:scale-95 rounded-xl transition-all border border-rose-200 cursor-pointer shrink-0"
                          title="حذف نهائي"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {/* Delete Confirmation Modal */}
      {serviceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 text-right">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
              <Trash2 className="w-7 h-7 stroke-[2]" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-slate-900">
                تأكيد حذف الخدمة نهائياً
              </h3>
              <p className="text-xs text-slate-600 font-bold leading-relaxed">
                هل أنت متأكد من رغبتك في حذف خدمة{" "}
                <span className="text-rose-600 font-black">
                  "{serviceToDelete.nameAr || serviceToDelete.name}"
                </span>{" "}
                من المتجر وقائمة الخدمات؟
              </p>
              <p className="text-[11px] text-slate-400 font-semibold">
                سيتم إخفاؤها فوراً ولن يتمكن الزوار من طلبها بعد الآن.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteService}
                className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-xl font-black text-xs transition-all shadow-md shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>نعم، تأكيد الحذف</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setServiceToDelete(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
