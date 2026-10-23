// Import and configure the Firebase SDK inside the service worker
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

// These are public Firebase web-app configuration values for the existing MauriTop project.
// Never place server credentials, private keys, or Gemini API keys in this file.
firebase.initializeApp({
  apiKey: "AIzaSyAYZ0LuM1ZRO479O9h096CKA5gfC5tOGs8",
  authDomain: "sincere-axe-58gvj.firebaseapp.com",
  projectId: "sincere-axe-58gvj",
  storageBucket: "sincere-axe-58gvj.firebasestorage.app",
  messagingSenderId: "561714259276",
  appId: "1:561714259276:web:b41ae35d6a6e8b3e8f9be9"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  // Avoid logging notification payloads, which may contain user-specific data.
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'تحديث من موري توب';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'تغيرت حالة طلبك الآن',
    icon: '/logo.png', // Fallback to logo
    badge: '/logo.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
