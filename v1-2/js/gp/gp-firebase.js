// gp-firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged as onAuthStateChangedSDK } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  get,
  update,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGZ9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.appspot.com",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:1a2bcd3ef4567gh8i9jkl",
  measurementId: "G-XXXXXXX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export function onAuthStateChanged(callback) {
  return onAuthStateChangedSDK(auth, callback);
}

export async function createNewLead(userUid) {
  const newRef = ref(db, "guestinfo");
  const pushRef = await push(newRef, {
    createdAt: Date.now(),
    status: "new",
    userUid: userUid || null
  });
  return pushRef.key;
}

export async function getGuest(gid) {
  const guestRef = ref(db, `guestinfo/${gid}`);
  const snap = await get(guestRef);
  return snap.exists() ? snap.val() : null;
}

export async function updateGuest(gid, data) {
  const guestRef = ref(db, `guestinfo/${gid}`);
  await update(guestRef, data);
}

export function attachCompletionListener(gid, onUpdate) {
  const completionRef = ref(db, `guestinfo/${gid}/completionPct`);
  off(completionRef, "value"); // detach previous listener if any
  onValue(completionRef, snapshot => {
    if (!snapshot.exists()) return;
    onUpdate(snapshot.val());
  });
}

export function getCurrentUserUid() {
  return auth.currentUser?.uid || null;
}