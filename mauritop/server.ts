import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { createServer as createViteServer } from "vite";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import * as admin from "firebase-admin";

import firebaseConfig from "./firebase-applet-config.json";

async function startServer() {
  let adminApp: admin.App | undefined;
  try {
    adminApp = admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
  } catch (e) {
    console.warn("Firebase Admin not initialized", e);
  }

  let db: Firestore | null = null;
  const getDb = () => {
    if (!db) {
      try {
        db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
      } catch (e) {
        console.error("Failed to get Firestore instance:", e);
        throw new Error("Firestore not initialized. Check Firebase Admin setup.");
      }
    }
    return db;
  };

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });
  const PORT = 3000;
  
  // Lazy init Gemini client to avoid crashes if API_KEY is missing
  let ai: GoogleGenAI | null = null;
  const getAi = () => {
    if (!ai) {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY environment variable is required");
      ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
    return ai;
  };

  // Diagnostic routes
  app.get("/api/health", (_req, res) => {
    return res.json({ status: "ok" });
  });

  // Idempotent referral signup bonus. All balance changes happen on the trusted server,
  // because clients must never increment another user's points directly.
  app.post("/api/referrals/signup-reward", async (req, res) => {
    if (!adminApp) {
      return res.status(503).json({ success: false, error: "Referral processing is not configured on this server." });
    }

    const authorization = String(req.headers.authorization || "");
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!idToken) return res.status(401).json({ success: false, error: "Authentication is required." });

    try {
      const decoded = await getAuth(adminApp).verifyIdToken(idToken);
      const firestore = getDb();
      const referredUserRef = firestore.collection("users").doc(decoded.uid);
      const transactionResult = await firestore.runTransaction(async (transaction) => {
        const referredUserSnapshot = await transaction.get(referredUserRef);
        if (!referredUserSnapshot.exists) return { status: "profile_missing" };
        const referredUser = referredUserSnapshot.data() || {};
        const referrerId = typeof referredUser.referredBy === "string" ? referredUser.referredBy.trim() : "";
        if (!referrerId || referrerId === decoded.uid || referredUser.signupReferralRewarded === true) {
          return { status: referredUser.signupReferralRewarded === true ? "already_rewarded" : "no_referral" };
        }
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(referrerId)) return { status: "invalid_referral" };

        const referrerRef = firestore.collection("users").doc(referrerId);
        const referrerSnapshot = await transaction.get(referrerRef);
        if (!referrerSnapshot.exists) return { status: "referrer_missing" };
        const referrer = referrerSnapshot.data() || {};
        if (referrer.blocked === true) return { status: "referrer_blocked" };

        const currentPoints = Number(referrer.loyaltyPoints ?? referrer.points ?? 0);
        if (!Number.isFinite(currentPoints) || currentPoints < 0) throw new Error("invalid_referrer_balance");
        transaction.update(referrerRef, { loyaltyPoints: currentPoints + 30 });
        transaction.update(referredUserRef, {
          signupReferralRewarded: true,
          signupReferralRewardedAt: FieldValue.serverTimestamp()
        });
        return { status: "rewarded", referrerId };
      });

      if (transactionResult.status === "rewarded" && transactionResult.referrerId) {
        try {
          await getDb().collection("notifications").add({
            userId: transactionResult.referrerId,
            title: "إحالة جديدة ناجحة!",
            body: "تم تسجيل مستخدم جديد عبر رابط إحالتك وإضافة 30 نقطة مكافأة.",
            read: false,
            type: "success",
            createdAt: FieldValue.serverTimestamp()
          });
        } catch (notificationError: any) {
          console.warn("Referral reward notification failed:", String(notificationError?.code || "notification_error"));
        }
      }

      return res.json({ success: true, status: transactionResult.status });
    } catch (error: any) {
      const code = String(error?.code || "");
      console.error("Referral bonus processing failed:", code || "server_error");
      if (code.includes("auth/id-token") || code.includes("auth/argument-error")) {
        return res.status(401).json({ success: false, error: "Authentication token is invalid or expired." });
      }
      return res.status(500).json({ success: false, error: "Could not process the referral bonus." });
    }
  });

  // Protected Firebase Cloud Messaging endpoint.
  // Uses the Firebase Admin SDK (HTTP v1 via ADC), never the retired legacy server-key API.
  app.post("/api/send-fcm", async (req, res) => {
    if (!adminApp) {
      return res.status(503).json({ success: false, error: "Firebase Admin is not configured on this server." });
    }

    const authorization = String(req.headers.authorization || "");
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!idToken) {
      return res.status(401).json({ success: false, error: "Authentication is required." });
    }

    try {
      const decoded = await getAuth(adminApp).verifyIdToken(idToken);
      // Never trust a mutable users/{uid}.role field for privileged server APIs.
      const callerIsAdmin = decoded.email?.toLowerCase() === "khyhajmr08@gmail.com" ||
        decoded.uid === "PqXqqCgdC1eYPz4HKHHLtDRejPD3";
      if (!callerIsAdmin) {
        return res.status(403).json({ success: false, error: "Administrator permission is required." });
      }

      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!token || token.length > 4096 || !title || title.length > 120 || !body || body.length > 1000) {
        return res.status(400).json({ success: false, error: "A valid token, title, and body are required." });
      }

      const messageId = await getMessaging(adminApp).send({
        token,
        notification: { title, body },
        webpush: {
          notification: { title, body, icon: "/logo.png", badge: "/logo.png" },
          fcmOptions: { link: "/notifications" }
        }
      });

      return res.json({ success: true, messageId });
    } catch (error: any) {
      // Do not log FCM tokens or return provider errors that may expose internals.
      console.error("FCM delivery failed:", String(error?.code || "provider_error"));
      const code = String(error?.code || "");
      if (code.includes("auth/id-token") || code.includes("auth/argument-error")) {
        return res.status(401).json({ success: false, error: "Authentication token is invalid or expired." });
      }
      if (code.includes("messaging/invalid-registration-token") || code.includes("messaging/registration-token-not-registered")) {
        return res.status(400).json({ success: false, error: "The notification token is invalid or expired." });
      }
      return res.status(502).json({ success: false, error: "The notification provider did not confirm delivery." });
    }
  });

  // Dynamic Sitemap Generator for Search Engines
  const generateSitemapXml = async (hostUrl: string = "https://mauritop.com") => {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

    const lastMod = new Date().toISOString().split('T')[0];

    // Static primary pages
    const staticPages = [
      { path: '', priority: '1.0', changefreq: 'daily' },
      { path: '/service-cards', priority: '0.9', changefreq: 'daily' },
      { path: '/calculator', priority: '0.8', changefreq: 'weekly' },
      { path: '/contact', priority: '0.7', changefreq: 'monthly' },
      { path: '/assistant', priority: '0.7', changefreq: 'weekly' },
      { path: '/login', priority: '0.6', changefreq: 'monthly' },
      { path: '/register', priority: '0.6', changefreq: 'monthly' },
      { path: '/privacy', priority: '0.4', changefreq: 'yearly' },
      { path: '/terms', priority: '0.4', changefreq: 'yearly' },
    ];

    staticPages.forEach(p => {
      xml += `  <url>\n    <loc>${hostUrl}${p.path}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
    });

    // Default core service IDs for fallback
    const defaultServiceIds = [
      'freefire', 'pubg', 'mobilelegends', 'fifa', 'netflix', 'canva', 'spotify', 'steam', 
      'playstation', 'xbox', 'googleplay', 'apple', 'roblox', 'tiktok', 'bingo', 'binance', 'usdt', 'bip', 'telegram'
    ];

    const serviceIdsSet = new Set<string>(defaultServiceIds);

    try {
      const firestore = getDb();
      const servicesSnapshot = await firestore.collection("services").get();
      servicesSnapshot.forEach(doc => {
        if (doc.id) serviceIdsSet.add(doc.id);
      });
    } catch (e) {
      console.warn("Firestore services fetch for sitemap skipped, using static catalog:", e);
    }

    serviceIdsSet.forEach(sId => {
      xml += `  <url>\n    <loc>${hostUrl}/services/${sId}</loc>\n    <lastmod>${lastMod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.95</priority>\n  </url>\n`;
    });

    xml += '</urlset>';
    return xml;
  };

  const handleSitemapRequest = async (req: express.Request, res: express.Response) => {
    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'mauritop.com';
      const baseUrl = `${protocol}://${host}`;
      
      const xml = await generateSitemapXml(baseUrl.includes('localhost') ? 'https://mauritop.com' : baseUrl);
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.status(200).send(xml);
    } catch (e) {
      console.error("Error generating dynamic sitemap:", e);
      res.status(500).send("Error generating sitemap");
    }
  };

  app.get("/sitemap.xml", handleSitemapRequest);
  app.get("/api/sitemap.xml", handleSitemapRequest);

  // Serve IndexNow Key file directly if requested
  app.get("/mauritop2026indexnowkey.txt", (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send("mauritop2026indexnowkey884729");
  });

  // IndexNow endpoint is authenticated and restricted to this site's own URLs.
  app.post("/api/indexnow/submit", express.json(), async (req, res) => {
    try {
      if (!adminApp) return res.status(503).json({ success: false, error: "خدمة المصادقة غير متاحة على الخادم." });
      const authorization = String(req.headers.authorization || "");
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      if (!idToken) return res.status(401).json({ success: false, error: "تسجيل الدخول مطلوب." });
      const decoded = await getAuth(adminApp).verifyIdToken(idToken);
      const isOwner = decoded.email?.toLowerCase() === "khyhajmr08@gmail.com" || decoded.uid === "PqXqqCgdC1eYPz4HKHHLtDRejPD3";
      let hasSeoPermission = false;
      if (!isOwner) {
        const staffSnap = await getDb().collection("adminMembers").doc(decoded.uid).get();
        const staffData = staffSnap.data();
        hasSeoPermission = staffData?.active === true && staffData?.permissions?.manageSEO === true;
      }
      if (!isOwner && !hasSeoPermission) return res.status(403).json({ success: false, error: "ليس لديك صلاحية استخدام أدوات الفهرسة." });

      const { urls, host } = req.body || {};
      const targetHost = "mauritop.com";
      if (host && host !== targetHost) return res.status(400).json({ success: false, error: "النطاق غير مسموح." });
      const apiKey = "mauritop2026indexnowkey884729";
      const keyLocation = `https://${targetHost}/mauritop2026indexnowkey.txt`;

      let urlList: string[] = [];
      if (Array.isArray(urls) && urls.length > 0) {
        if (urls.length > 100 || urls.some((candidate: unknown) => typeof candidate !== "string" || candidate.length > 2048)) {
          return res.status(400).json({ success: false, error: "قائمة الروابط غير صالحة أو طويلة جداً." });
        }
        urlList = urls.map((candidate: string) => {
          const url = new URL(candidate.startsWith("http") ? candidate : `https://${targetHost}${candidate.startsWith("/") ? "" : "/"}${candidate}`);
          if (url.protocol !== "https:" || url.hostname !== targetHost || url.username || url.password) throw new Error("invalid_indexnow_url");
          return url.toString();
        });
      } else {
        urlList = [
          `https://${targetHost}/`,
          `https://${targetHost}/service-cards`,
          `https://${targetHost}/calculator`,
          `https://${targetHost}/contact`,
          `https://${targetHost}/services/freefire`,
          `https://${targetHost}/services/pubg`,
          `https://${targetHost}/services/netflix`,
          `https://${targetHost}/services/canva`,
          `https://${targetHost}/services/spotify`
        ];
      }

      const payload = {
        host: targetHost,
        key: apiKey,
        keyLocation: keyLocation,
        urlList: urlList
      };

      const results: Record<string, any> = {};

      // 1. Submit to IndexNow Protocol central endpoint
      try {
        const indexNowRes = await fetch("https://api.indexnow.org/IndexNow", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload)
        });
        results.indexNowOrg = {
          status: indexNowRes.status,
          ok: indexNowRes.ok || indexNowRes.status === 200 || indexNowRes.status === 202,
          message: indexNowRes.status === 200 ? "تم إرسال الروابط بنجاح (200 OK)" : indexNowRes.status === 202 ? "تم قبول طلب الفهرسة وفي انتظار المعالجة (202 Accepted)" : `Status: ${indexNowRes.status}`
        };
      } catch (err: any) {
        results.indexNowOrg = { ok: false, error: err?.message || "تعذر الاتصال بـ api.indexnow.org" };
      }

      // 2. Submit directly to Bing IndexNow endpoint
      try {
        const bingRes = await fetch("https://www.bing.com/IndexNow", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(payload)
        });
        results.bing = {
          status: bingRes.status,
          ok: bingRes.ok || bingRes.status === 200 || bingRes.status === 202,
          message: bingRes.status === 200 ? "قبول الروابط في Bing (200 OK)" : bingRes.status === 202 ? "قبول الطلب في Bing (202 Accepted)" : `Status: ${bingRes.status}`
        };
      } catch (err: any) {
        results.bing = { ok: false, error: err?.message || "تعذر الاتصال بـ Bing IndexNow" };
      }

      // 3. Ping Google Sitemap URL
      try {
        const googlePingUrl = `https://www.google.com/ping?sitemap=https://${targetHost}/sitemap.xml`;
        const googleRes = await fetch(googlePingUrl);
        results.googleSitemapPing = {
          status: googleRes.status,
          ok: googleRes.ok || googleRes.status === 200,
          message: googleRes.ok ? "تم إرسال إشعار السايت ماب لجوجل بنجاح" : `Status: ${googleRes.status}`
        };
      } catch (err: any) {
        results.googleSitemapPing = { ok: false, error: err?.message || "تعذر التنبيه المباشر لجوجل" };
      }

      return res.json({
        success: true,
        submittedUrlsCount: urlList.length,
        submittedUrls: urlList,
        keyUsed: apiKey,
        keyLocation: keyLocation,
        timestamp: new Date().toISOString(),
        results
      });
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code.includes("auth/id-token") || code.includes("auth/argument-error")) {
        return res.status(401).json({ success: false, error: "جلسة الدخول غير صالحة. سجّل الدخول مجدداً." });
      }
      if (String(error?.message || "").includes("invalid_indexnow_url") || error instanceof TypeError) {
        return res.status(400).json({ success: false, error: "تحتوي قائمة الروابط على رابط غير صالح أو خارج نطاق الموقع." });
      }
      console.error("IndexNow submission failed:", code || "server_error");
      return res.status(502).json({ success: false, error: "تعذر إرسال طلب الفهرسة حالياً." });
    }
  });

  app.get("/api/chat", (_req, res) => {
    return res.json({ status: "available", method: "POST" });
  });

  // Basic per-IP rate limiting and payload limits reduce accidental or automated API-cost abuse.
  const chatRateLimits = new Map<string, { count: number; resetAt: number }>();
  const CHAT_WINDOW_MS = 60_000;
  const CHAT_MAX_REQUESTS = 20;

  app.post("/api/chat", async (req, res) => {
    const now = Date.now();
    const clientKey = String(req.ip || req.socket.remoteAddress || "unknown");
    const currentLimit = chatRateLimits.get(clientKey);
    if (currentLimit && currentLimit.resetAt > now && currentLimit.count >= CHAT_MAX_REQUESTS) {
      return res.status(429).json({ error: "تم تجاوز عدد الرسائل المسموح به مؤقتاً. حاول بعد دقيقة." });
    }
    if (!currentLimit || currentLimit.resetAt <= now) {
      chatRateLimits.set(clientKey, { count: 1, resetAt: now + CHAT_WINDOW_MS });
    } else {
      currentLimit.count += 1;
    }
    // Remove expired entries occasionally so the in-memory map does not grow indefinitely.
    if (chatRateLimits.size > 2000) {
      for (const [key, value] of chatRateLimits) if (value.resetAt <= now) chatRateLimits.delete(key);
    }

    try {
      const { contents } = req.body || {};
      if (!Array.isArray(contents) || contents.length === 0 || contents.length > 12) {
        return res.status(400).json({ error: "يرجى إرسال سجل محادثة صالح لا يتجاوز 12 رسالة." });
      }

      let totalChars = 0;
      for (const item of contents) {
        if (!item || !["user", "model"].includes(item.role) || !Array.isArray(item.parts) || item.parts.length === 0) {
          return res.status(400).json({ error: "صيغة الرسالة غير صالحة." });
        }
        for (const part of item.parts) {
          if (!part || typeof part.text !== "string" || part.text.length > 5000) {
            return res.status(400).json({ error: "نص الرسالة غير صالح أو طويل جداً." });
          }
          totalChars += part.text.length;
        }
      }
      if (totalChars > 16000) {
        return res.status(413).json({ error: "حجم المحادثة كبير جداً. ابدأ محادثة جديدة." });
      }

      const client = getAi();
      const response = await client.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
        config: {
          systemInstruction: `أنت المساعد الذكي لمنصة "موري توب" (Mouri Top). مهمتك مساعدة المستخدمين في استفسارات الخدمات الرقمية وشحن الألعاب بوضوح وود، ولا تدّعِ أنك تحققت من طلب أو دفعة من دون بيانات موثوقة.`,
          temperature: 0.7,
        },
      });

      if (!response.text) {
        return res.status(502).json({ error: "لم يرجع المساعد إجابة صالحة. حاول مرة أخرى." });
      }
      return res.json({ text: response.text });
    } catch (err: any) {
      const missingKey = String(err?.message || "").includes("GEMINI_API_KEY");
      console.error("Gemini chat request failed:", missingKey ? "missing_api_key" : String(err?.status || err?.code || "provider_error"));
      return res.status(missingKey ? 503 : 502).json({
        error: missingKey
          ? "المساعد الذكي غير مهيأ على الخادم بعد. يلزم ضبط مفتاح Gemini Auth في أسرار الخادم."
          : "تعذر الاتصال بالمساعد الذكي حالياً. حاول لاحقاً."
      });
    }
  });

  wss.on("connection", async (clientWs, req) => {
    // Live API sessions cost money. Require a verified Firebase ID token belonging to an admin.
    // The current frontend does not use this endpoint; browser voice support needs a secure token handshake first.
    try {
      if (!adminApp) throw new Error("admin_unavailable");
      const authorization = String(req.headers.authorization || "");
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      if (!idToken) throw new Error("auth_required");
      const decoded = await getAuth(adminApp).verifyIdToken(idToken);
      // Never trust a mutable users/{uid}.role field for privileged server APIs.
      const callerIsAdmin = decoded.email?.toLowerCase() === "khyhajmr08@gmail.com" ||
        decoded.uid === "PqXqqCgdC1eYPz4HKHHLtDRejPD3";
      if (!callerIsAdmin) throw new Error("admin_required");

      const session = await getAi().live.connect({
        model: "gemini-3.8-live",
        callbacks: {
          onmessage: (message: any) => {
            const audioParts = message.serverContent?.modelTurn?.parts || [];
            for (const part of audioParts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (message.serverContent?.interrupted)
              clientWs.send(JSON.stringify({ interrupted: true }));
          },
        },
        config: {
          responseModalities: ["AUDIO" as any],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "أنت المساعد الرقمي لمنصة 'موري توب' (Mouri Top). ساعد المستخدمين بوضوح وود في استفساراتهم المتعلقة بالخدمات الرقمية وشحن الألعاب.",
        },
      });

      clientWs.on("message", (data: any) => {
        try {
          const { audio } = JSON.parse(data.toString());
          if (audio) {
            session.sendRealtimeInput({
              audio: { data: audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (e) {
          console.error("Error processing client audio message", e);
        }
      });

      clientWs.on("close", () => {
        session.close();
      });
    } catch (e: any) {
      const reason = String(e?.message || "");
      const closeCode = reason === "auth_required" ? 4401 : reason === "admin_required" ? 4403 : 1011;
      console.warn("Gemini Live session rejected:", reason === "auth_required" || reason === "admin_required" ? reason : "session_unavailable");
      clientWs.close(closeCode, "Authenticated live session required");
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ 
      server: { middlewareMode: true, hmr: false }, 
      appType: "spa" 
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  server.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
