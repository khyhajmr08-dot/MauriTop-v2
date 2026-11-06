import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { createServer as createViteServer } from "vite";
import { getFirestore, Firestore, Timestamp } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";
import { isValidMauritanianPhone, isServicePurchasable, validateIndexNowUrl, resolveCanonicalUrl, computeOrderPayloadHash } from "./src/lib/orderValidation.ts";

import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

async function startServer(options: { serverless?: boolean } = {}): Promise<express.Express> {
  const serverless = options.serverless === true;
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
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  const OWNER_UID = 'PqXqqCgdC1eYPz4HKHHLtDRejPD3';
  const OWNER_EMAIL = 'khyhajmr08@gmail.com';

  // Lightweight per-instance abuse throttling for public API endpoints.
  // Production deployments with multiple instances should additionally enforce
  // quotas at the gateway/platform level.
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  const rateLimit = (limit: number, windowMs: number): express.RequestHandler => (req, res, next) => {
    const key = `${req.path}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }
    if (rateBuckets.size > 3000) {
      for (const [bucketKey, value] of rateBuckets.entries()) {
        if (now >= value.resetAt) rateBuckets.delete(bucketKey);
      }
    }
    next();
  };

  const requireActiveUser: express.RequestHandler = async (req, res, next) => {
    try {
      if (!adminApp) {
        res.status(503).json({ error: 'Authentication service is not configured.' });
        return;
      }
      const authorization = req.get('authorization') || '';
      const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const decoded = await getAuth(adminApp).verifyIdToken(tokenMatch[1]);
      (req as any).user = decoded;

      // Verify user is not blocked
      const firestore = getDb();
      const userDoc = await firestore.collection("users").doc(decoded.uid).get();
      if (userDoc.exists && userDoc.data()?.blocked === true) {
        res.status(403).json({ error: 'Your account is blocked. Contact support.' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };

  const ROLE_PERMISSIONS: Record<string, string[]> = {
    owner: ['view_dashboard', 'manage_orders', 'manage_services', 'manage_content', 'manage_finance', 'view_analytics', 'manage_support', 'manage_users', 'manage_settings', 'export_data'],
    support: ['view_dashboard', 'manage_support', 'manage_orders'],
    orders: ['view_dashboard', 'manage_orders'],
    finance: ['view_dashboard', 'manage_finance', 'export_data', 'view_analytics'],
    catalog: ['view_dashboard', 'manage_services'],
    content: ['view_dashboard', 'manage_content'],
    analytics: ['view_dashboard', 'view_analytics', 'export_data'],
    user: []
  };

  const requireStaffPermission = (permission: string): express.RequestHandler => async (req, res, next) => {
    try {
      if (!adminApp) {
        res.status(503).json({ error: 'Authentication service is not configured.' });
        return;
      }
      const authorization = req.get('authorization') || '';
      const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const decoded = await getAuth(adminApp).verifyIdToken(tokenMatch[1]);
      (req as any).user = decoded;

      // Owner has full access
      if (decoded.uid === OWNER_UID || (decoded.email?.toLowerCase() === OWNER_EMAIL && decoded.email_verified === true)) {
        (req as any).staffRole = 'owner';
        return next();
      }

      // Resolve staff role from trusted Firestore user record
      const firestore = getDb();
      const userDoc = await firestore.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: 'Staff access denied: user profile not found.' });
      }
      const userData = userDoc.data() || {};
      if (userData.blocked === true) {
        return res.status(403).json({ error: 'Account is blocked.' });
      }

      const role = String(userData.staffRole || userData.role || 'user').toLowerCase();
      const allowedPerms = ROLE_PERMISSIONS[role] || [];
      if (!allowedPerms.includes(permission)) {
        return res.status(403).json({ error: `Staff permission '${permission}' required.` });
      }

      (req as any).staffRole = role;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };

  const checkMaintenanceMode: express.RequestHandler = async (req, res, next) => {
    try {
      const firestore = getDb();
      const globalDoc = await firestore.collection("settings").doc("global").get();
      if (globalDoc.exists && globalDoc.data()?.maintenanceMode === true) {
        return res.status(503).json({
          code: 'MAINTENANCE_MODE',
          error: 'المنصة في وضع الصيانة حالياً لاستقبال التحديثات. يرجى المحاولة لاحقاً.'
        });
      }
      next();
    } catch (err) {
      console.error("Maintenance check error:", err);
      return res.status(503).json({
        code: 'MAINTENANCE_STATUS_UNAVAILABLE',
        error: 'تعذر التحقق من حالة المنصة حالياً. لم يتم قبول الطلب؛ يرجى المحاولة لاحقاً.'
      });
    }
  };

  const requireOwner: express.RequestHandler = async (req, res, next) => {
    try {
      if (!adminApp) {
        res.status(503).json({ error: 'Authentication service is not configured.' });
        return;
      }
      const authorization = req.get('authorization') || '';
      const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
      if (!tokenMatch) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const decoded = await getAuth(adminApp).verifyIdToken(tokenMatch[1]);
      const isTrustedOwner = decoded.uid === OWNER_UID ||
        (decoded.email?.toLowerCase() === OWNER_EMAIL && decoded.email_verified === true);
      if (!isTrustedOwner) {
        res.status(403).json({ error: 'Owner authorization required.' });
        return;
      }
      (req as any).user = decoded;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };

  // Vercel handles HTTP requests through a serverless Express function.
  // Keep the standalone HTTP/WebSocket server only for local development.
  const server = serverless ? null : createServer(app);
  const wss = server ? new WebSocketServer({ server, path: '/live', maxPayload: 64 * 1024 }) : null;
  const liveSessionCounts = new Map<string, number>();
  const PORT = Number(process.env.PORT) || 3000;
  
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

  // Diagnostic routes reporting backend readiness and critical dependency status
  app.get("/api/health", async (req, res) => {
    let firestoreStatus = "unknown";
    try {
      if (adminApp) {
        const firestore = getDb();
        await firestore.collection("settings").doc("global").get();
        firestoreStatus = "ready";
      } else {
        firestoreStatus = "not_initialized";
      }
    } catch (e: any) {
      firestoreStatus = "error";
    }

    return res.json({
      status: "ok",
      ready: firestoreStatus === "ready",
      nodeEnv: process.env.NODE_ENV || 'production',
      firestore: firestoreStatus,
      auth: adminApp ? "ready" : "unconfigured",
      storage: adminApp ? "ready" : "unconfigured",
      timestamp: new Date().toISOString()
    });
  });

  // Verify receipt object in Firebase Storage using Admin SDK with ownership verification
  const verifyStorageReceipt = async (
    proofUrl: string,
    expectedUserId: string
  ): Promise<{ valid: boolean; error?: string }> => {
    if (!proofUrl || typeof proofUrl !== 'string') {
      return { valid: false, error: 'Proof URL is missing' };
    }
    try {
      if (!adminApp) return { valid: false, error: 'Storage admin not initialized' };
      // Parse storage path from URL
      const decodedUrl = decodeURIComponent(proofUrl);
      const match = decodedUrl.match(/\/o\/([^?#]+)/);
      if (!match || !match[1]) {
        return { valid: false, error: 'Invalid storage URL format' };
      }
      const storagePath = match[1];

      // Ownership check: path must match the expected user namespace
      const expectedPrefix = `order-receipts/${expectedUserId}/`;
      if (!storagePath.startsWith(expectedPrefix)) {
        return { valid: false, error: 'Receipt does not belong to the authorized checkout attempt' };
      }

      const bucket = getStorage(adminApp).bucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        return { valid: false, error: 'Receipt file does not exist in storage' };
      }
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || '';
      const size = Number(metadata.size || 0);
      if (!contentType.startsWith('image/')) {
        return { valid: false, error: 'Uploaded file is not a valid image' };
      }
      if (size > 8 * 1024 * 1024) {
        return { valid: false, error: 'Receipt image exceeds 8MB size limit' };
      }
      return { valid: true };
    } catch (err: any) {
      console.error("Storage receipt verification error:", err);
      return { valid: false, error: 'فشل التحقق من إيصال الدفع في التخزين السحابي' };
    }
  };

  // Staff self-identity endpoint
  app.get("/api/staff/me", requireStaffPermission('view_dashboard'), async (req, res) => {
    try {
      const user = (req as any).user;
      const staffRole = (req as any).staffRole;
      const isOwner = user.uid === OWNER_UID || (user.email?.toLowerCase() === OWNER_EMAIL && user.email_verified === true);
      const permissions = isOwner ? ROLE_PERMISSIONS.owner : (ROLE_PERMISSIONS[staffRole] || []);
      return res.json({
        uid: user.uid,
        email: user.email,
        role: staffRole,
        isOwner,
        permissions
      });
    } catch (err: any) {
      console.error("Staff me error:", err);
      return res.status(500).json({ error: 'Failed to retrieve staff identity.' });
    }
  });

  // Owner set-role endpoint
  app.post("/api/admin/set-role", requireOwner, rateLimit(10, 60_000), async (req, res) => {
    try {
      const { targetUid, role } = req.body || {};
      const validRoles = ['user', 'support', 'orders', 'finance', 'catalog', 'content', 'analytics'];
      if (!targetUid || typeof targetUid !== 'string') {
        return res.status(400).json({ error: 'معرف المستخدم المستهدف مطلوب.' });
      }
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'الدور المحدد غير صالح.' });
      }

      const firestore = getDb();
      const targetUserRef = firestore.collection("users").doc(targetUid);
      const targetDoc = await targetUserRef.get();
      if (!targetDoc.exists) {
        return res.status(404).json({ error: 'المستخدم غير موجود.' });
      }

      await targetUserRef.update({
        staffRole: role,
        role: role,
        updatedAt: Timestamp.now()
      });

      // Audit log entry
      await firestore.collection("admin_logs").add({
        action: 'SET_STAFF_ROLE',
        targetUid,
        assignedRole: role,
        performedBy: (req as any).user?.uid || 'owner',
        timestamp: Timestamp.now()
      });

      return res.json({ success: true, message: `تم تعيين الدور بنجاح إلى ${role}` });
    } catch (err: any) {
      console.error("Admin set-role error:", err);
      return res.status(500).json({ error: 'فشل تعيين الدور.' });
    }
  });

  // Secure Guest Checkout Endpoint
  app.post("/api/guest/orders", checkMaintenanceMode, rateLimit(10, 60_000), async (req, res) => {
    try {
      const {
        attemptId,
        trackingToken,
        serviceId,
        serviceType,
        paymentMethod,
        senderPhone,
        senderRef,
        proofImageUrl,
        accountDetails,
        fields,
        amount
      } = req.body || {};

      if (typeof attemptId !== "string" || !/^[a-f0-9]{32}$/i.test(attemptId) ||
          typeof trackingToken !== "string" || !/^[a-f0-9]{64}$/i.test(trackingToken)) {
        return res.status(400).json({ error: 'بيانات محاولة الطلب غير صالحة. يرجى تحديث الصفحة والمحاولة مجدداً.' });
      }

      // 1. Phone number validation (Mauritanian 8-digit starting with 2, 3, or 4)
      const cleanPhone = String(senderPhone || '').replace(/\D/g, '');
      if (cleanPhone.length !== 8 || !/^[234]/.test(cleanPhone)) {
        return res.status(400).json({ error: 'رقم هاتف غير صالح. يجب أن يتكون من 8 أرقام ويبدأ بـ 2 أو 3 أو 4.' });
      }

      if (!serviceId || typeof serviceId !== 'string') {
        return res.status(400).json({ error: 'الخدمة المطلوبة غير صالحة.' });
      }

      const firestore = getDb();
      const serviceDoc = await firestore.collection("services").doc(serviceId).get();
      if (!serviceDoc.exists) {
        return res.status(404).json({ error: 'الخدمة غير موجودة.' });
      }
      const sData = serviceDoc.data() || {};
      if (!isServicePurchasable(sData)) {
        return res.status(400).json({ error: 'هذه الخدمة غير متاحة للشراء حالياً أو تم إيقافها مؤقتاً.' });
      }

      // Quote mode is controlled only by trusted service configuration.
      const isQuoteMode = sData.pricingMode === "quote";
      if ((String(paymentMethod || "").toLowerCase() === "quote") !== isQuoteMode) {
        return res.status(400).json({ error: 'طريقة التسعير المرسلة لا تطابق إعدادات الخدمة.' });
      }
      let verifiedAmount = isQuoteMode ? 0 : Number(amount || 0);
      if (sData.pricingMode === "fixed") {
        verifiedAmount = Number(sData.priceMru || sData.price || 0);
      }
      if (!isQuoteMode && (isNaN(verifiedAmount) || verifiedAmount <= 0)) {
        return res.status(400).json({ error: 'مبلغ الطلب غير صالح.' });
      }

      // A non-quote payment must match a saved, enabled payment configuration.
      if (!isQuoteMode) {
        const normalizedMethodKey = String(paymentMethod || '').toLowerCase() === 'gazapay' ? 'gaza' : String(paymentMethod || '').toLowerCase();
        const settingsDoc = await firestore.collection("settings").doc("payment_methods").get();
        const methodsData = settingsDoc.exists ? (settingsDoc.data()?.methods || settingsDoc.data() || {}) : {};
        const methodConf = methodsData[normalizedMethodKey];
        const legacyDefaultKey = ['bankily', 'sadad', 'gaza'].includes(normalizedMethodKey);
        const methodEnabled = !!methodConf && (
          typeof methodConf.enabled === 'boolean' ? methodConf.enabled : legacyDefaultKey
        );
        const gatewayReady = methodConf?.type !== 'electronic_gateway' || methodConf?.integrationStatus === 'operational';
        if (!methodEnabled || !gatewayReady) {
          return res.status(400).json({ error: 'طريقة الدفع المختارة غير متوفرة أو غير مهيأة حالياً.' });
        }
      }

      // 2. Receipt verification for manual payment
      if (!isQuoteMode && ['bankily', 'sadad', 'gaza', 'gazapay'].includes(String(paymentMethod).toLowerCase())) {
        if (!proofImageUrl || typeof proofImageUrl !== 'string') {
          return res.status(400).json({ error: 'يرجى إرفاق إيصال الدفع لإتمام الطلب.' });
        }
        const receiptCheck = await verifyStorageReceipt(proofImageUrl, "guest");
        if (!receiptCheck.valid) {
          return res.status(400).json({ error: receiptCheck.error || 'إيصال الدفع غير صالح.' });
        }
      }

      // 3. Create the guest order and its idempotency record atomically.
      // The raw tracking secret is returned to the same browser attempt; only
      // its SHA-256 hash is ever stored in Firestore.
      const rawTrackingToken = trackingToken;
      const hashedTrackingToken = crypto.createHash("sha256").update(rawTrackingToken).digest("hex");
      const normalizedPaymentMethod = String(paymentMethod || '').toLowerCase();
      const payloadHash = computeOrderPayloadHash({
        senderPhone: cleanPhone,
        serviceId,
        serviceType: serviceType || sData.name || sData.title || serviceId,
        paymentMethod: normalizedPaymentMethod,
        senderRef: senderRef || '',
        proofImageUrl: proofImageUrl || '',
        accountDetails: accountDetails || '',
        fields: fields || {},
        amount: verifiedAmount
      });

      const idempotencyRef = firestore.collection("idempotency_keys").doc(`guest_${attemptId}`);
      const newOrderRef = firestore.collection("orders").doc();
      const now = Timestamp.now();
      let finalOrderId = newOrderRef.id;
      let isRetry = false;

      await firestore.runTransaction(async (transaction) => {
        const idempotencySnapshot = await transaction.get(idempotencyRef);
        if (idempotencySnapshot.exists) {
          const existingAttempt = idempotencySnapshot.data() || {};
          if (existingAttempt.payloadHash !== payloadHash ||
              existingAttempt.trackingTokenHash !== hashedTrackingToken) {
            throw new Error("IDEMPOTENCY_CONFLICT");
          }

          const existingOrderId = String(existingAttempt.orderId || "");
          if (!existingOrderId) throw new Error("IDEMPOTENCY_ORDER_MISSING");
          const existingOrderRef = firestore.collection("orders").doc(existingOrderId);
          const existingOrderSnapshot = await transaction.get(existingOrderRef);
          if (!existingOrderSnapshot.exists || existingOrderSnapshot.data()?.userId !== "guest") {
            throw new Error("IDEMPOTENCY_ORDER_MISSING");
          }

          finalOrderId = existingOrderId;
          isRetry = true;
          return;
        }

        // The duplicate check is inside the same transaction so simultaneous
        // requests for the same guest attempt cannot both create an order.
        const existingQuery = firestore.collection("orders")
          .where("senderPhone", "==", cleanPhone)
          .limit(10);
        const existingSnapshot = await transaction.get(existingQuery);
        const hasDuplicate = existingSnapshot.docs.some((orderDoc) => {
          const data = orderDoc.data();
          return data.serviceId === serviceId && data.status === "pending";
        });
        if (hasDuplicate) throw new Error("DUPLICATE_ACTIVE_ORDER");

        const orderData = {
          id: newOrderRef.id,
          userId: "guest",
          isGuest: true,
          userEmail: `guest_${cleanPhone}@mauritop.local`,
          userName: `زائر (${cleanPhone})`,
          serviceId,
          serviceType: serviceType || sData.name || sData.title || serviceId,
          serviceTitleAr: sData.titleAr || sData.nameAr || sData.title || sData.name || serviceId,
          amount: verifiedAmount,
          fee: 0,
          total: verifiedAmount,
          paymentMethod: normalizedPaymentMethod || 'bankily',
          senderPhone: cleanPhone,
          senderRef: senderRef || '',
          proofImageUrl: proofImageUrl || '',
          proofUrl: proofImageUrl || '',
          accountDetails: accountDetails || '',
          fields: fields || {},
          status: 'pending',
          trackingTokenHash: hashedTrackingToken,
          payloadHash,
          createdAt: now,
          updatedAt: now
        };

        transaction.create(newOrderRef, orderData);
        transaction.create(idempotencyRef, {
          attemptId,
          orderId: newOrderRef.id,
          payloadHash,
          trackingTokenHash: hashedTrackingToken,
          createdAt: now
        });
      });

      return res.status(isRetry ? 200 : 201).json({
        success: true,
        orderId: finalOrderId,
        trackingToken: rawTrackingToken,
        isRetry,
        message: 'تم تسجيل طلبك بنجاح. احتفظ برمز التتبع لمتابعة طلبك.'
      });

    } catch (err: any) {
      if (err?.message === "DUPLICATE_ACTIVE_ORDER") {
        return res.status(409).json({ error: 'لديك طلب قيد الانتظار لنفس الخدمة بالفعل. يرجى الانتظار حتى اكتماله.' });
      }
      if (err?.message === "IDEMPOTENCY_CONFLICT") {
        return res.status(409).json({ error: 'تم استخدام محاولة الطلب نفسها ببيانات مختلفة. حدّث الصفحة وراجع حالة طلباتك قبل البدء من جديد.' });
      }
      console.error("Guest order error:", err);
      return res.status(500).json({ error: 'تعذر معالجة الطلب حالياً. يرجى المحاولة لاحقاً.' });
    }
  });

  // Authenticated Order Creation Endpoint
  app.post("/api/orders/create", checkMaintenanceMode, requireActiveUser, rateLimit(10, 60_000), async (req, res) => {
    try {
      const user = (req as any).user;
      const {
        orderId,
        serviceId,
        serviceType,
        paymentMethod,
        senderPhone,
        senderRef,
        proofImageUrl,
        accountDetails,
        fields,
        amount
      } = req.body || {};

      const cleanPhone = String(senderPhone || '').replace(/\D/g, '');
      if (!isValidMauritanianPhone(cleanPhone)) {
        return res.status(400).json({ error: 'رقم هاتف غير صالح.' });
      }

      const firestore = getDb();
      const serviceDoc = await firestore.collection("services").doc(serviceId).get();
      if (!serviceDoc.exists) {
        return res.status(404).json({ error: 'الخدمة غير موجودة.' });
      }
      const sData = serviceDoc.data() || {};
      if (!isServicePurchasable(sData)) {
        return res.status(400).json({ error: 'هذه الخدمة غير متاحة للشراء حالياً أو تم إيقافها مؤقتاً.' });
      }

      const isQuoteMode = sData.pricingMode === "quote";
      if ((String(paymentMethod || "").toLowerCase() === "quote") !== isQuoteMode) {
        return res.status(400).json({ error: 'طريقة التسعير المرسلة لا تطابق إعدادات الخدمة.' });
      }

      let verifiedAmount = isQuoteMode ? 0 : Number(amount || 0);
      if (sData.pricingMode === "fixed") {
        verifiedAmount = Number(sData.priceMru || sData.price || 0);
      }
      if (!isQuoteMode && (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0)) {
        return res.status(400).json({ error: 'مبلغ الطلب غير صالح.' });
      }

      if (!isQuoteMode) {
        const normalizedMethodKey = String(paymentMethod || '').toLowerCase() === 'gazapay' ? 'gaza' : String(paymentMethod || '').toLowerCase();
        const settingsDoc = await firestore.collection("settings").doc("payment_methods").get();
        const methodsData = settingsDoc.exists ? (settingsDoc.data()?.methods || settingsDoc.data() || {}) : {};
        const methodConf = methodsData[normalizedMethodKey];
        const legacyDefaultKey = ['bankily', 'sadad', 'gaza'].includes(normalizedMethodKey);
        const methodEnabled = !!methodConf && (
          typeof methodConf.enabled === 'boolean' ? methodConf.enabled : legacyDefaultKey
        );
        const gatewayReady = methodConf?.type !== 'electronic_gateway' || methodConf?.integrationStatus === 'operational';
        if (!methodEnabled || !gatewayReady) {
          return res.status(400).json({ error: 'طريقة الدفع المختارة غير متوفرة أو غير مهيأة حالياً.' });
        }
      }
      if (!isQuoteMode && ['bankily', 'sadad', 'gaza', 'gazapay'].includes(String(paymentMethod).toLowerCase())) {
        if (!proofImageUrl || typeof proofImageUrl !== 'string') {
          return res.status(400).json({ error: 'يرجى إرفاق إيصال الدفع لإتمام الطلب.' });
        }
        const receiptCheck = await verifyStorageReceipt(proofImageUrl, user.uid);
        if (!receiptCheck.valid) {
          return res.status(400).json({ error: receiptCheck.error || 'إيصال الدفع غير صالح.' });
        }
      }

      // Compute order payload hash for idempotency checking
      const payloadHash = computeOrderPayloadHash({
        userId: user.uid,
        serviceId,
        serviceType,
        paymentMethod,
        senderPhone: cleanPhone,
        senderRef,
        proofImageUrl,
        accountDetails,
        fields,
        amount: verifiedAmount
      });

      const { idempotencyKey } = req.body || {};
      const targetOrderId = typeof orderId === "string" && orderId.trim() ? orderId.trim() : firestore.collection("orders").doc().id;
      const orderRef = firestore.collection("orders").doc(targetOrderId);
      const idempotencyRef = (typeof idempotencyKey === 'string' && idempotencyKey.trim())
        ? firestore.collection("idempotency_keys").doc(`${user.uid}_${idempotencyKey.trim()}`)
        : null;

      const now = Timestamp.now();
      let isRetry = false;
      let finalOrderId = targetOrderId;

      await firestore.runTransaction(async (transaction) => {
        // 1. Check idempotency key document if provided
        if (idempotencyRef) {
          const idemSnap = await transaction.get(idempotencyRef);
          if (idemSnap.exists) {
            const idemData = idemSnap.data() || {};
            // Matching payload: return the existing order safely
            if (idemData.payloadHash === payloadHash && idemData.userId === user.uid) {
              isRetry = true;
              finalOrderId = idemData.orderId;
              return;
            }
            // Conflicting reuse with different payload: reject
            throw new Error('IDEMPOTENCY_CONFLICT');
          }
        }

        // 2. Check target order document
        const existingDoc = await transaction.get(orderRef);
        if (existingDoc.exists) {
          const existingData = existingDoc.data() || {};
          // If the same user retries with the same payload for the same order ID: return existing order
          if (existingData.userId === user.uid && existingData.payloadHash === payloadHash) {
            isRetry = true;
            finalOrderId = orderRef.id;
            return;
          }
          // Any other reuse of an existing order ID must be rejected
          throw new Error('ORDER_EXISTS');
        }

        // 3. Atomically persist order and idempotency record
        transaction.set(orderRef, {
          id: orderRef.id,
          userId: user.uid,
          userName: user.name || user.email?.split('@')[0] || 'User',
          userEmail: user.email || '',
          serviceId,
          serviceType: serviceType || sData.name || serviceId,
          serviceTitleAr: sData.titleAr || sData.nameAr || serviceId,
          amount: verifiedAmount,
          fee: 0,
          total: verifiedAmount,
          paymentMethod: paymentMethod || 'bankily',
          senderPhone: cleanPhone,
          senderRef: senderRef || '',
          proofImageUrl: proofImageUrl || '',
          proofUrl: proofImageUrl || '',
          accountDetails: accountDetails || '',
          fields: fields || {},
          status: 'pending',
          payloadHash,
          idempotencyKey: idempotencyKey || null,
          createdAt: now,
          updatedAt: now
        });

        if (idempotencyRef) {
          transaction.set(idempotencyRef, {
            userId: user.uid,
            orderId: orderRef.id,
            payloadHash,
            createdAt: now
          });
        }
      });

      return res.status(isRetry ? 200 : 201).json({
        success: true,
        orderId: finalOrderId,
        isRetry
      });
    } catch (err: any) {
      if (err?.message === 'ORDER_EXISTS' || err?.message === 'IDEMPOTENCY_CONFLICT') {
        return res.status(409).json({ error: 'معرف الطلب أو مفتاح التكرار محجوز ولا يمكن استبداله ببيانات مختلفة.' });
      }
      console.error("Auth order error:", err);
      return res.status(500).json({ error: 'خطأ أثناء إنشاء الطلب.' });
    }
  });

  // Secure Guest Order Tracking Endpoint (requires token hash matching)
  app.post("/api/guest/track", rateLimit(30, 60_000), async (req, res) => {
    try {
      const { orderId, trackingToken } = req.body || {};
      if (!orderId || !trackingToken || typeof orderId !== 'string' || typeof trackingToken !== 'string') {
        return res.status(400).json({ error: 'رقم الطلب ورمز التتبع السري مطلوبان.' });
      }

      const firestore = getDb();
      const orderDoc = await firestore.collection("orders").doc(orderId).get();
      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'لم يتم العثور على الطلب.' });
      }

      const oData = orderDoc.data() || {};
      const expectedHash = crypto.createHash("sha256").update(trackingToken).digest("hex");
      if (oData.trackingTokenHash !== expectedHash) {
        return res.status(403).json({ error: 'رمز التتبع السري غير صحيح.' });
      }

      // Return order status details (redacting sensitive fields)
      return res.json({
        success: true,
        order: {
          id: orderDoc.id,
          serviceId: oData.serviceId,
          serviceType: oData.serviceType,
          serviceTitleAr: oData.serviceTitleAr,
          amount: oData.amount,
          status: oData.status,
          createdAt: oData.createdAt?.toDate ? oData.createdAt.toDate() : oData.createdAt,
          updatedAt: oData.updatedAt?.toDate ? oData.updatedAt.toDate() : oData.updatedAt,
          paymentMethod: oData.paymentMethod
        }
      });
    } catch (err: any) {
      console.error("Guest track error:", err);
      return res.status(500).json({ error: 'خطأ أثناء تتبع الطلب.' });
    }
  });

  // User referral stats endpoint returning only safe caller statistics
  app.get("/api/user/referrals", requireActiveUser, rateLimit(20, 60_000), async (req, res) => {
    try {
      const user = (req as any).user;
      const firestore = getDb();
      const userDoc = await firestore.collection("users").doc(user.uid).get();
      const userData = userDoc.data() || {};

      // Query referrals count where referredBy matches caller UID
      const refsSnapshot = await firestore.collection("users")
        .where("referredBy", "==", user.uid)
        .get();

      return res.json({
        referralCode: userData.referralCode || user.uid.slice(0, 8),
        totalReferred: refsSnapshot.size,
        loyaltyPoints: Number(userData.loyaltyPoints || 0),
        rewardPerReferral: 30,
        minimumWithdrawal: 500
      });
    } catch (err: any) {
      console.error("Error in /api/user/referrals:", err);
      return res.status(500).json({ error: 'تعذر جلب بيانات الإحالات.' });
    }
  });

  // Referral withdrawal endpoint ensuring 500 MRU minimum and atomic reservation
  app.post("/api/wallet/withdraw", requireActiveUser, rateLimit(5, 60_000), async (req, res) => {
    try {
      const user = (req as any).user;
      const { amount, bankilyPhone } = req.body || {};
      const numAmount = Number(amount);
      const cleanPhone = String(bankilyPhone || '').replace(/\D/g, '');

      if (cleanPhone.length !== 8 || !/^[234]/.test(cleanPhone)) {
        return res.status(400).json({ error: 'يرجى إدخال رقم هاتف بنكيلي صالح (8 أرقام يبدأ بـ 2 أو 3 أو 4).' });
      }
      if (isNaN(numAmount) || numAmount < 500) {
        return res.status(400).json({ error: 'الحد الأدنى لطلب السحب هو 500 أوقية (MRU).' });
      }

      const firestore = getDb();
      const userRef = firestore.collection("users").doc(user.uid);
      const withdrawalRef = firestore.collection("withdrawals").doc();

      const result = await firestore.runTransaction(async (tx) => {
        const uDoc = await tx.get(userRef);
        if (!uDoc.exists) throw new Error("المستخدم غير موجود");
        const uData = uDoc.data() || {};
        const currentPoints = Number(uData.loyaltyPoints || uData.points || 0);

        if (currentPoints < numAmount) {
          throw new Error("رصيدك الحالي غير كافٍ لإتمام السحب");
        }

        const now = Timestamp.now();
        tx.update(userRef, {
          loyaltyPoints: currentPoints - numAmount,
          points: currentPoints - numAmount,
          lastWithdrawalRequestId: withdrawalRef.id,
          updatedAt: now
        });

        tx.set(withdrawalRef, {
          id: withdrawalRef.id,
          userId: user.uid,
          userName: user.name || uData.name || 'User',
          userEmail: user.email || uData.email || '',
          amount: numAmount,
          bankilyPhone: cleanPhone,
          status: 'pending',
          createdAt: now,
          adminNote: ''
        });

        return { newBalance: currentPoints - numAmount };
      });

      return res.status(201).json({
        success: true,
        withdrawalId: withdrawalRef.id,
        newBalance: result.newBalance,
        remainingBalance: result.newBalance,
        message: 'تم تقديم طلب السحب بنجاح وهو قيد المراجعة.'
      });
    } catch (err: any) {
      console.error("Withdrawal error:", err);
      return res.status(400).json({ error: err?.message || 'تعذر معالجة طلب السحب.' });
    }
  });

  // Cloud Messaging dispatch is owner-only. Never accept arbitrary public
  // requests to send push notifications or echo FCM tokens into responses/logs.
  app.post("/api/send-fcm", requireOwner, rateLimit(10, 60_000), async (req, res) => {
    try {
      const { token, title, body } = req.body || {};
      if (typeof token !== 'string' || token.length < 20 || token.length > 4096 ||
          typeof title !== 'string' || !title.trim() || title.length > 150 ||
          typeof body !== 'string' || !body.trim() || body.length > 2000) {
        return res.status(400).json({ error: 'Invalid notification payload.' });
      }
      if (!adminApp) return res.status(503).json({ error: 'Messaging service is not configured.' });
      const messageId = await getMessaging(adminApp).send({
        token,
        notification: { title: title.trim(), body: body.trim() },
        data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' }
      });
      return res.json({ success: true, messageId });
    } catch (err) {
      console.error("FCM dispatch failed.");
      return res.status(500).json({ error: 'Notification dispatch failed.' });
    }
  });

  // Canonical Site URL Resolution using production logic
  const getCanonicalBaseUrl = (req?: express.Request): string => {
    const forwardedHost = req ? (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase() : undefined;
    return resolveCanonicalUrl(process.env.CANONICAL_SITE_URL, forwardedHost);
  };

  // Dynamic Sitemap Generator for Search Engines
  const generateSitemapXml = async (canonicalBase: string) => {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

    // Static primary public pages
    const staticPages = [
      { path: '', priority: '1.0', changefreq: 'daily' },
      { path: '/service-cards', priority: '0.9', changefreq: 'weekly' },
      { path: '/calculator', priority: '0.8', changefreq: 'monthly' },
      { path: '/contact', priority: '0.7', changefreq: 'monthly' },
      { path: '/assistant', priority: '0.7', changefreq: 'weekly' },
      { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
      { path: '/terms', priority: '0.3', changefreq: 'yearly' },
    ];

    staticPages.forEach(p => {
      xml += `  <url>\n    <loc>${canonicalBase}${p.path}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
    });

    try {
      const firestore = getDb();
      const servicesSnapshot = await firestore.collection("services").get();
      servicesSnapshot.forEach(doc => {
        const data = doc.data();
        // Only index non-deleted, active public services
        if (doc.id && data.status !== 'Deleted' && data.status !== 'deleted' && data.status !== 'Draft' && data.status !== 'متوقف') {
          let lastmodTag = '';
          const updated = data.updatedAt || data.createdAt;
          if (updated && typeof updated.toDate === 'function') {
            lastmodTag = `\n    <lastmod>${updated.toDate().toISOString().split('T')[0]}</lastmod>`;
          } else if (typeof updated === 'string' && /^\d{4}-\d{2}-\d{2}/.test(updated)) {
            lastmodTag = `\n    <lastmod>${updated.slice(0, 10)}</lastmod>`;
          }
          xml += `  <url>\n    <loc>${canonicalBase}/services/${encodeURIComponent(doc.id)}</loc>${lastmodTag}\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
        }
      });
    } catch (e) {
      console.warn("Firestore services fetch for sitemap failed:", e);
    }

    xml += '</urlset>';
    return xml;
  };

  const handleSitemapRequest = async (req: express.Request, res: express.Response) => {
    try {
      const canonicalBase = getCanonicalBaseUrl(req);
      const xml = await generateSitemapXml(canonicalBase);
      res.header('Content-Type', 'application/xml; charset=utf-8');
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

  // IndexNow & Instant SEO Indexing API Route
  app.post("/api/indexnow/submit", requireOwner, rateLimit(10, 60_000), async (req, res) => {
    try {
      const { urls, host } = req.body || {};
      const canonicalBase = getCanonicalBaseUrl(req);
      const parsedCanonical = new URL(canonicalBase);
      const targetHost = parsedCanonical.hostname.toLowerCase();
      const apiKey = "mauritop2026indexnowkey884729";
      const keyLocation = `https://${targetHost}/mauritop2026indexnowkey.txt`;

      let urlList: string[] = [];
      if (Array.isArray(urls) && urls.length > 0) {
        if (urls.length > 100 || !urls.every((u: unknown) => typeof u === 'string' && u.length <= 2048)) {
          return res.status(400).json({ success: false, error: "Invalid URL list." });
        }
        try {
          urlList = urls.map((raw: string) => validateIndexNowUrl(raw, targetHost));
        } catch (validationError: any) {
          return res.status(400).json({ success: false, error: validationError.message || "Invalid URL." });
        }
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

      // Google discontinued the unauthenticated sitemap ping endpoint in 2023.
      // Google sitemap submission must be handled through Search Console or robots.txt.
      results.googleSitemapPing = {
        ok: false,
        manualRequired: true,
        message: 'Google لا يدعم رابط Sitemap Ping القديم. أرسل sitemap.xml عبر Google Search Console.'
      };

      const acceptedByIndexNow = Boolean(results.indexNowOrg?.ok || results.bing?.ok);
      return res.status(acceptedByIndexNow ? 200 : 502).json({
        success: acceptedByIndexNow,
        submittedUrlsCount: urlList.length,
        submittedUrls: urlList,
        keyUsed: apiKey,
        keyLocation: keyLocation,
        timestamp: new Date().toISOString(),
        results
      });
    } catch (error: any) {
      console.error("IndexNow submission error:", error);
      return res.status(500).json({ success: false, error: error?.message || "خطأ في السيرفر الداخلي" });
    }
  });

  app.get("/api/chat", (req, res) => {
    return res.json({ message: "Mouri Top Gemini API chat endpoint is active. Use POST to communicate." });
  });

  // Secure context-aware text chatbot route
  app.post("/api/chat", rateLimit(20, 60_000), async (req, res) => {
    try {
      // Optional Firebase ID token verification for authenticated callers
      let callerUid: string | null = null;
      let callerEmail: string | null = null;
      let callerName: string | null = null;
      const authorization = req.get('authorization') || '';
      const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
      if (tokenMatch && adminApp) {
        try {
          const decoded = await getAuth(adminApp).verifyIdToken(tokenMatch[1]);
          callerUid = decoded.uid;
          callerEmail = decoded.email || null;
          callerName = decoded.name || null;
        } catch {
          // Non-blocking for guests; callerUid remains null
        }
      }

      const { contents, conversationId, userName } = req.body || {};
      if (!Array.isArray(contents) || contents.length === 0 || contents.length > 20) {
        return res.status(400).json({ error: "Invalid contents parameter. Expected 1–20 messages." });
      }
      const serializedContents = JSON.stringify(contents);
      if (serializedContents.length > 24000 || !contents.every((item: any) =>
        item && ['user', 'model'].includes(item.role) && Array.isArray(item.parts) &&
        item.parts.length > 0 && item.parts.length <= 4 &&
        item.parts.every((part: any) => part && typeof part.text === 'string' && part.text.length <= 6000)
      )) {
        return res.status(413).json({ error: "Message payload is too large or malformed." });
      }

      let generatedText = "";
      try {
        const client = getAi();
        const response = await client.models.generateContent({
          model: "gemini-3.8-flash",
          contents,
          config: {
            maxOutputTokens: 700,
            systemInstruction: `أنت "المساعد الذكي" الرسمي لمنصة موري توب (Mouri Top)، وهي منصة لشحن الألعاب والاشتراكات الرقمية.

هويتك وأسلوبك:
- أنت خبير مبيعات ودعم فني محترف، ودود جداً، وصبور.
- تتحدث بلهجة موريتانية مهذبة (حسانية مبسطة) ممزوجة بالعربية الفصحى لضمان الوضوح التام لكل المستخدمين، أو بالفرنسية إذا بدأ المستخدم الحديث بها.
- هدفك الأساسي هو مساعدة المستخدمين في اختيار الخدمات المناسبة، شرح كيفية الشحن والطلب، وحل مشكلاتهم التقنية بروح المبادرة.
- **القاعدة الذهبية: تجنب التكرار الممل.** لا تبدأ كل جملة بنفس العبارة (مثل "أهلاً بك" في كل رد). نوع في تحياتك وردودك لتكون طبيعية وبشرية.
- كن ذكياً في استنتاج ما يريده المستخدم. إذا سأل عن "جواهر" فهو يقصد غالباً فري فاير. إذا سأل عن "شدات" فهو يقصد ببجي. إذا سأل عن "نقاط" فقد يقصد فيفا أو موبايل ليجندز.

معلومات التواصل والمنصة:
1. رقم الإدارة والدعم الفني الرسمي (واتساب) هو: 32014902 (أو +22232014902). هذا هو الرقم الوحيد المعتمد للتواصل المباشر مع المدير. إذا سأل المستخدم عن "رقم الإدارة" أو "التواصل" أو "واتساب"، قدم له هذا الرقم فوراً وبفخر.
2. طرق الدفع المتاحة في MAURITOP ديناميكية ويتم إدارتها عبر إعدادات لوحة التحكم، وتشمل افتراضياً بنكيلي (Bankily)، سداد (Sedad)، وغزة باي (Gaza Pay)، بالإضافة إلى أي وسائل دفع محلية إضافية مفعلة في النظام. PayPal غير متاح بعد، ولا تعد المستخدم بأنه يعمل.
3. أهم الخدمات المتوفرة:
   - ألعاب: شحن فري فاير (جواهر بالـ ID)، ببجي موبايل (شدات UC فوري)، موبايل ليجندز، روبلوكس، EA Sports FC (فيفا سابقاً)، وكول أوف ديوتي.
   - اشتراكات: نتفليكس (شاشات وحسابات كاملة)، شاهد VIP، تود (TOD) للمباريات، سبوتيفاي بريميوم، كانفا برو، ويوتيوب بريميوم.
   - بطاقات هدايا: آبل، جوجل بلاي، بلايستيشن، إكس بوكس، بينانس، وبطاقات الفيزا الافتراضية.

قواعد الرد الاحترافية:
- **الأسعار:** لا تدّعِ أن الأسعار هي الأفضل في السوق ولا تخمّن سعراً. اطلب من المستخدم فتح صفحة الخدمة لرؤية السعر الحالي، أو التواصل مع الدعم 32014902 إذا لم يظهر السعر.
- **السرعة:** اشرح أن مدة التنفيذ تعتمد على الخدمة وحالة الطلب؛ لا تعد بمدة محددة إلا إذا كانت الصفحة تعرض زمناً موثقاً.
- **طريقة الطلب:** اشرح له ببساطة: "اختر الخدمة -> أدخل المعرف (ID) -> اختر المبلغ -> ادفع عبر بنكيلي أو سداد -> ارفع صورة الإشعار -> مبروك!".
- **الأمان والخصوصية:** طمئن المستخدم دائماً بأننا لا نطلب كلمات مرور (Password) إطلاقاً. الشحن يتم بأمان عبر المعرف (ID) فقط.
- **الدعم الفني:** إذا كان لدى المستخدم مشكلة في طلب قديم، اطلب منه تزويدك برقم الطلب (إن وجد) أو التواصل مباشرة مع واتساب الإدارة 32014902.

كن استباقياً وناصحاً:
- لا تكتفِ بالإجابة القصيرة، بل اقترح باقات توفيرية (مثلاً: "إذا كنت تشحن فري فاير باستمرار، أنصحك بعروض الـ 1000 جوهرة فهي توفر لك أكثر").
- إذا كان العميل متردداً، أجب بمعلومات موثقة فقط ولا تختلق أرقام عملاء أو شهادات ثقة.
- دائماً اختم بعبارة تشجيعية أو سؤال يساعده في الخطوة القادمة.`,
            temperature: 0.7,
          },
        });
        generatedText = response.text || "";
      } catch (geminiError) {
        console.warn("Gemini generation failed, using intelligent fallback:", geminiError);
        generatedText = `🤖 **مساعد موري توب**\n\nأهلاً بك! نحن هنا لمساعدتك في شحن الألعاب والاشتراكات. يمكنك الاطلاع على وسائل الدفع المتاحة فعلياً في صفحة الدفع أو التواصل مع الدعم عبر واتساب (32014902).`;
      }

      // Persist conversation to Firestore if conversationId is provided
      if (conversationId && typeof conversationId === "string" && conversationId.length <= 128) {
        try {
          const firestore = getDb();
          const convRef = firestore.collection("ai_conversations").doc(conversationId);
          const existing = await convRef.get();

          const lastUserMsg = contents[contents.length - 1]?.parts?.[0]?.text || "";
          const newMessages = [
            { role: "user", text: lastUserMsg, timestamp: new Date().toISOString() },
            { role: "model", text: generatedText, timestamp: new Date().toISOString() }
          ];

          if (existing.exists) {
            const data = existing.data();
            // Ownership protection: If conversation belongs to another registered user, do not overwrite or mix history
            if (data?.userId && callerUid && data.userId !== callerUid) {
              return res.status(403).json({ error: "Access denied to this conversation." });
            }
            const currentMsgs = Array.isArray(data?.messages) ? data.messages : [];
            await convRef.update({
              messages: [...currentMsgs, ...newMessages].slice(-50),
              updatedAt: new Date().toISOString(),
              lastMessage: generatedText.slice(0, 200),
              lastUserMessage: lastUserMsg.slice(0, 200),
              messageCount: (data?.messageCount || currentMsgs.length) + 2
            });
          } else {
            await convRef.set({
              conversationId,
              userId: callerUid,
              userEmail: callerEmail,
              userName: callerName || (typeof userName === "string" ? userName : "زائر / عميل"),
              messages: newMessages,
              status: "open", // open, resolved, escalated
              internalNotes: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastMessage: generatedText.slice(0, 200),
              lastUserMessage: lastUserMsg.slice(0, 200),
              messageCount: 2
            });
          }
        } catch (storageError) {
          console.warn("Failed to persist conversation history to Firestore:", storageError);
        }
      }

      return res.json({ text: generatedText });
    } catch (err: any) {
      console.error("Error in /api/chat:", err);
      
      const fallbackText = `🤖 **مساعد موري توب**\n\nأهلاً بك! نحن هنا لمساعدتك في شحن الألعاب والاشتراكات. يمكنك الاطلاع على وسائل الدفع المتاحة فعلياً في صفحة الدفع أو التواصل مع الدعم عبر واتساب.`;

      return res.json({ 
        text: fallbackText,
        isFallback: true 
      });
    }
  });

  // Admin API: List and filter AI assistant conversations
  app.get("/api/admin/ai-conversations", requireOwner, async (req, res) => {
    try {
      const firestore = getDb();
      const status = typeof req.query.status === "string" ? req.query.status : null;

      let q: FirebaseFirestore.Query = firestore.collection("ai_conversations");
      if (status && ["open", "resolved", "escalated"].includes(status)) {
        q = q.where("status", "==", status);
      }

      const snap = await q.orderBy("updatedAt", "desc").limit(100).get();
      const conversations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.json({ conversations });
    } catch (err: any) {
      console.error("Error fetching AI conversations:", err);
      return res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Admin API: Update conversation status and internal staff notes
  app.patch("/api/admin/ai-conversations/:id", requireOwner, async (req, res) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const { status, internalNotes } = req.body || {};
      if (typeof id !== "string" || !id.trim()) {
        return res.status(400).json({ error: "Conversation ID is required." });
      }

      const updateData: any = { updatedAt: new Date().toISOString() };
      if (status && ["open", "resolved", "escalated"].includes(status)) {
        updateData.status = status;
      }
      if (typeof internalNotes === "string") {
        updateData.internalNotes = internalNotes.slice(0, 5000);
      }

      const firestore = getDb();
      await firestore.collection("ai_conversations").doc(id).update(updateData);
      return res.json({ success: true, message: "Conversation updated successfully" });
    } catch (err: any) {
      console.error("Error updating AI conversation:", err);
      return res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  // Authenticate before opening a billable Gemini Live session. The first
  // WebSocket message must be { type: "auth", token: <Firebase ID token> }.
  // The client should wait for { authenticated: true, ready: true } before audio.
  if (wss) {
    wss.on("connection", (clientWs) => {
      let authenticatedUid: string | null = null;
      let liveSession: any = null;
      let closed = false;
      let authStarted = false;
      let frameWindowStart = Date.now();
      let frameCount = 0;
  
      const authTimer = setTimeout(() => closeSocket(4401, 'Authentication required'), 5000);
      const closeSocket = (code: number, message: string) => {
        if (clientWs.readyState === 0 || clientWs.readyState === 1) {
          clientWs.close(code, message.slice(0, 120));
        }
      };
      const cleanup = () => {
        closed = true;
        clearTimeout(authTimer);
        if (authenticatedUid) {
          const count = liveSessionCounts.get(authenticatedUid) || 0;
          if (count <= 1) liveSessionCounts.delete(authenticatedUid);
          else liveSessionCounts.set(authenticatedUid, count - 1);
          authenticatedUid = null;
        }
        try { liveSession?.close(); } catch { /* best-effort session cleanup */ }
        liveSession = null;
      };
  
      clientWs.once('close', cleanup);
      clientWs.once('error', cleanup);
      clientWs.once('message', async (rawData) => {
        if (authStarted) return;
        authStarted = true;
        try {
          if (!adminApp) {
            closeSocket(1011, 'Authentication service unavailable');
            return;
          }
          const message = JSON.parse(rawData.toString());
          if (message?.type !== 'auth' || typeof message.token !== 'string' || message.token.length > 8192) {
            closeSocket(4401, 'Authentication required');
            return;
          }
          const decoded = await getAuth(adminApp).verifyIdToken(message.token);
          if (closed || clientWs.readyState !== 1) return;
          const currentCount = liveSessionCounts.get(decoded.uid) || 0;
          if (currentCount >= 2) {
            closeSocket(4429, 'Too many active voice sessions');
            return;
          }
          authenticatedUid = decoded.uid;
          liveSessionCounts.set(authenticatedUid, currentCount + 1);
          clearTimeout(authTimer);
  
          liveSession = await getAi().live.connect({
            model: 'gemini-3.8-live',
            callbacks: {
              onmessage: (message: any) => {
                if (clientWs.readyState !== 1) return;
                const audioParts = message.serverContent?.modelTurn?.parts || [];
                for (const part of audioParts) {
                  if (part.inlineData?.data) {
                    clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                  }
                }
                if (message.serverContent?.interrupted) {
                  clientWs.send(JSON.stringify({ interrupted: true }));
                }
              },
            },
            config: {
              responseModalities: ['AUDIO' as any],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
              systemInstruction: "أنت المساعد الرقمي لمنصة 'موري توب' (Mouri Top). ساعد المستخدمين بوضوح وود في استفساراتهم المتعلقة بالخدمات الرقمية وشحن الألعاب. وسائل الدفع المتاحة حالياً هي بنكيلي وسداد فقط؛ PayPal غير متاح بعد.",
            },
          });
  
          if (closed || clientWs.readyState !== 1) {
            cleanup();
            return;
          }
          clientWs.send(JSON.stringify({ authenticated: true, ready: true }));
  
          clientWs.on('message', (data: any) => {
            try {
              const now = Date.now();
              if (now - frameWindowStart >= 10_000) {
                frameWindowStart = now;
                frameCount = 0;
              }
              frameCount += 1;
              if (frameCount > 240) {
                closeSocket(4429, 'Audio message rate exceeded');
                cleanup();
                return;
              }
              const audioMessage = JSON.parse(data.toString());
              if (typeof audioMessage?.audio !== 'string' || audioMessage.audio.length > 48_000) return;
              liveSession?.sendRealtimeInput({ audio: { data: audioMessage.audio, mimeType: 'audio/pcm;rate=16000' } });
            } catch {
              // Ignore malformed client frames without logging audio or token data.
            }
          });
        } catch {
          closeSocket(4401, 'Invalid authentication or session setup failed');
        }
      });
    });
  }

  if (!serverless) {
    // Vite middleware / static SPA serving is used by the standalone local server.
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

    server?.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
  }

  return app;
}

// Vercel's /api/[...path] function imports this Express application. Initialize
// the route table once per warm function instance and reuse it for later calls.
let vercelAppPromise: Promise<express.Express> | null = null;
const vercelApp = express();
vercelApp.use((req, res, next) => {
  if (!vercelAppPromise) {
    vercelAppPromise = startServer({ serverless: true });
  }
  vercelAppPromise
    .then((application) => application(req, res, next))
    .catch(next);
});

export default vercelApp;

// Preserve the current local development workflow: npm run dev starts the
// Vite middleware server and its optional /live WebSocket endpoint.
if (process.env.VERCEL !== "1") {
  void startServer().catch((error) => {
    console.error("Failed to start MauriTop server:", error);
    process.exitCode = 1;
  });
}
