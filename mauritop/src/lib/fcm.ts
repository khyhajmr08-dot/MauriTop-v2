import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";

// The VAPID public key must be copied from the same Firebase project that issues FCM tokens.
// Do not use a fabricated fallback: it makes notification registration fail silently.
const VAPID_KEY = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim();

/**
 * Request notification permissions and register user token
 */
export async function setupFCM(userId: string): Promise<string | null> {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn("FCM Messaging is not supported in this browser environment / secure context.");
      return null;
    }

    if (!VAPID_KEY) {
      console.warn("Push notifications are not configured: set VITE_FIREBASE_VAPID_KEY to the public VAPID key from Firebase Console.");
      return null;
    }

    const messagingResult = getMessaging();
    
    // Request permission from user
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission was not granted:", permission);
      return null;
    }

    // Retrieve FCM Token
    const token = await getToken(messagingResult, {
      vapidKey: VAPID_KEY
    });

    if (token) {
      // Save Token to user's document in Firestore
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        fcmToken: token,
        // Also save to array of device tokens to support multiple devices
        fcmTokens: arrayUnion(token),
        notificationsEnabled: true,
        updatedAt: new Date()
      });
      
      console.info("FCM token registered successfully.");
      return token;
    } else {
      console.warn("No FCM token returned from Firebase.");
      return null;
    }
  } catch (error) {
    console.error("Error setting up Firebase Cloud Messaging:", error);
    return null;
  }
}

/**
 * Setup foreground message handler
 */
export async function listenForForegroundMessages(onMsg: (payload: any) => void) {
  try {
    const supported = await isSupported();
    if (!supported) return null;

    const messagingResult = getMessaging();
    return onMessage(messagingResult, (payload) => {
      console.log("Foreground FCM message received:", payload);
      onMsg(payload);
    });
  } catch (err) {
    console.warn("FCM Foreground listener setup failed:", err);
    return null;
  }
}
