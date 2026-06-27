import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics, isSupported, logEvent } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvU8lYpqwDbjDLcE9BDpBk0tfK3sIjgHI",
  authDomain: "dokonmalumotlari.firebaseapp.com",
  projectId: "dokonmalumotlari",
  storageBucket: "dokonmalumotlari.firebasestorage.app",
  messagingSenderId: "57700189836",
  appId: "1:57700189836:web:e232f06ee078dc8b9a5da9",
  measurementId: "G-CP08FEEB15"
};

const app = initializeApp(firebaseConfig);
let analytics = null;

window.zamonFirebase = { app, analytics: null, ready: false };
window.zamonLogEvent = () => {};

isSupported()
  .then((supported) => {
    if (!supported) return;
    analytics = getAnalytics(app);
    window.zamonFirebase = { app, analytics, ready: true };
    window.zamonLogEvent = (eventName, params = {}) => {
      logEvent(analytics, eventName, params);
    };
    window.zamonLogEvent("app_open");
  })
  .catch(() => {
    window.zamonFirebase = { app, analytics: null, ready: false };
  });
