import { ReactNode, useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/useAuth";
import BottomNavigation from "./BottomNavigation";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { LogOut, LayoutDashboard, History, ShoppingBag, UserCircle, ShieldCheck, Home, Bell, Sparkles, AlertTriangle, Info, Megaphone, ClipboardList } from "lucide-react";
import { auth, db } from "../lib/firebase";
import { collection, query, where, doc, getDoc, getDocs } from "firebase/firestore";
import { APP_NAME } from "../constants";
import { useLanguage } from "../contexts/LanguageContext";
import { cn } from "../lib/utils";
import { cacheService } from "../lib/cache";
import FCMNotificationBanner from "./FCMNotificationBanner";
import { motion, AnimatePresence } from "motion/react";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, isOwnerAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, isRtl } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState<any>(null);
  
  // Real-time Push Notification banner states
  const [pushNotification, setPushNotification] = useState<{ title: string; body: string } | null>(null);
  const [isPushOpen, setIsPushOpen] = useState(false);
  const isInitialLoad = useRef(true);
  const hasReconciledServices = useRef(false);

  const [prevPathname, setPrevPathname] = useState(location.pathname);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (location.pathname !== prevPathname) {
      const getIndex = (path: string) => {
        const routes = ["/", "/orders", "/history", "/profile", "/notifications"];
        const matchIndex = routes.indexOf(path);
        if (matchIndex !== -1) return matchIndex;
        const prefixIndex = routes.findIndex(r => r !== "/" && path.startsWith(r));
        return prefixIndex !== -1 ? prefixIndex : 0;
      };

      const prevIdx = getIndex(prevPathname);
      const curIdx = getIndex(location.pathname);
      
      setDirection(curIdx >= prevIdx ? 1 : -1);
      setPrevPathname(location.pathname);
    }
  }, [location.pathname, prevPathname]);

  useEffect(() => {
    // Initial load from cache to prevent flicker
    const cached = cacheService.get<any>("global_settings");
    if (cached) setSettings(cached);

    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, "settings", "global"));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(data);
          cacheService.set("global_settings", data, 1000 * 60 * 5);
        } else {
          setSettings({ servicesSeeded: false, maintenanceMode: false });
        }
      } catch (error) {
        console.warn("Settings fetch error:", error);
      }
    };
    fetchSettings();
  }, []);



  useEffect(() => {
    if (!isOwnerAdmin || !settings || hasReconciledServices.current) return;
    hasReconciledServices.current = true;
    const reconcileMissingServices = async () => {
      try {
        const { setDoc, doc, serverTimestamp } = await import("firebase/firestore");
        const { SERVICES } = await import("../data/services");
        const snapshot = await getDocs(collection(db, "services"));
        const existingIds = new Set(snapshot.docs.map((item) => item.id));
        for (const [index, service] of SERVICES.entries()) {
          if (!service?.id || existingIds.has(String(service.id))) continue;
          await setDoc(doc(db, "services", String(service.id)), {
            id: service.id,
            name: service.name,
            nameAr: service.nameAr || service.name,
            nameFr: service.nameFr || service.name,
            description: service.description || "",
            descriptionAr: service.descriptionAr || "",
            descriptionFr: service.descriptionFr || "",
            image: service.image || service.imageUrl || "",
            imageUrl: service.imageUrl || service.image || "",
            priceMru: service.suggestedPrice || service.minAmount || 0,
            badge: service.category === "ألعاب" ? "شحن ألعاب" : service.category === "اشتراكات" ? "اشتراكات" : "خدمات رقمية",
            imageFit: service.imageFit || "cover",
            status: service.status || "نشط",
            order: index + 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        }
        await setDoc(doc(db, "settings", "global"), { servicesSeeded: true }, { merge: true });
      } catch (error) {
        hasReconciledServices.current = false;
        console.warn("Missing service reconciliation skipped:", error);
      }
    };
    void reconcileMissingServices();
  }, [isOwnerAdmin, settings]);

  useEffect(() => {
    if (!user) return;
    
    // Real-time Firestore notification live synchronizer & push triggering hook
    const q = query(
      collection(db, "notifications"), 
      where("userId", "==", user.uid), 
      where("read", "==", false)
    );
    
    const fetchNotifications = async () => {
      try {
        const querySnapshot = await getDocs(q);
        setUnreadCount(querySnapshot.size);
      } catch (err) {
        console.warn("Error fetching unread count:", err);
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 1000 * 60 * 30); // Poll every 30 minutes
    return () => clearInterval(interval);
  }, [user]);
    
  useEffect(() => {
    // Standard FCM Foreground subscription
    let fcmUnsubscribe: (() => void) | null = null;
    import("../lib/fcm").then(({ listenForForegroundMessages }) => {
      listenForForegroundMessages((payload) => {
        if (payload?.notification) {
          setPushNotification({
            title: payload.notification.title || "إشعار فوري",
            body: payload.notification.body || ""
          });
          setIsPushOpen(true);
        }
      }).then(unsubFn => {
        if (typeof unsubFn === "function") {
          fcmUnsubscribe = unsubFn;
        }
      });
    }).catch(err => console.log("FCM import skipped or unsupported on this system:", err));

    return () => {
      if (fcmUnsubscribe) fcmUnsubscribe();
    };
  }, [user]);

  const isAuthPage = ["/login", "/register", "/forgot-password"].includes(location.pathname);

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className={cn("min-h-screen bg-main-bg font-sans text-text-primary overflow-x-hidden relative", isRtl ? "rtl" : "ltr")}>
      <div className="absolute inset-0 -z-10 bg-main-bg" />
      
      {/* Main Content Area with Page Transitions */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={location.pathname}
          custom={direction}
          variants={{
            initial: (dir: number) => ({
              opacity: 0,
              x: dir > 0 ? (isRtl ? -40 : 40) : (isRtl ? 40 : -40),
              filter: "blur(4px)"
            }),
            animate: {
              opacity: 1,
              x: 0,
              filter: "blur(0px)"
            },
            exit: (dir: number) => ({
              opacity: 0,
              x: dir > 0 ? (isRtl ? 40 : -40) : (isRtl ? -40 : 40),
              filter: "blur(4px)"
            })
          }}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className="layout-container layout-main-spacing"
        >
          {children}
        </motion.div>
      </AnimatePresence>

      {/* Internal Page Footer */}
      <Footer />
    </div>
  );
}
