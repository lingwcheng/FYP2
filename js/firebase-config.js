// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBC56mVDzFpnkOTlb_JTD_mF1iwx6W_hb4",
  authDomain: "fyp2-diagnostic-system.firebaseapp.com",
  projectId: "fyp2-diagnostic-system",
  storageBucket: "fyp2-diagnostic-system.firebasestorage.app",
  messagingSenderId: "50337981131",
  appId: "1:50337981131:web:0851fc8c9ed85a13faf14e"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);