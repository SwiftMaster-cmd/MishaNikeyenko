// gp-firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  push,
  update,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.firebasestorage.app",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:8758776701786a2fccf2d0",
  measurementId: "G-9HWXNSBE1T"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export function firebaseOnAuthStateChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function createNewLead(userUid) {
  const leadsRef = ref(db, "guestinfo");
  const newLeadRef = push(leadsRef);
  await update(newLeadRef, {
    createdAt: Date.now(),
    status: "new",
    userUid: userUid || null,
  });
  return newLeadRef.key;
}

export async function getGuest(gid) {
  const guestRef = ref(db, `guestinfo/${gid}`);
  const snapshot = await get(guestRef);
  return snapshot.exists() ? snapshot.val() : null;
}

export async function updateGuest(gid, data) {
  const guestRef = ref(db, `guestinfo/${gid}`);
  await update(guestRef, data);
}

export function listenCompletionPct(gid, callback) {
  const pctRef = ref(db, `guestinfo/${gid}/completionPct`);
  return onValue(pctRef, (snapshot) => {
    if (snapshot.exists()) callback(snapshot.val());
  });
}

export function getCurrentUserUid() {
  return auth.currentUser?.uid || null;
}