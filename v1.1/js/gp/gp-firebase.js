// gp-firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  get,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.appspot.com",
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

export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function getCurrentUserUid() {
  return auth.currentUser?.uid || null;
}

export async function createNewLead(userUid) {
  const guestRef = ref(db, "guestinfo");
  const newRef = push(guestRef);
  await update(newRef, {
    createdAt: Date.now(),
    updatedAt: Date.now(),   // <-- add updatedAt here on creation
    status: "new",
    userUid: userUid || null
  });
  return newRef.key;
}

export async function getGuest(gid) {
  const guestRef = ref(db, `guestinfo/${gid}`);
  const snap = await get(guestRef);
  return snap.exists() ? snap.val() : null;
}

export async function updateGuest(gid, data) {
  const guestRef = ref(db, `guestinfo/${gid}`);
  // Make sure updatedAt is always set when updating
  if (!data.updatedAt) {
    data.updatedAt = Date.now();
  }
  await update(guestRef, data);
}

export function attachCompletionListener(gid, onUpdate) {
  const completionRef = ref(db, `guestinfo/${gid}/completionPct`);
  onValue(completionRef, (snapshot) => {
    if (snapshot.exists()) {
      onUpdate(snapshot.val());
    }
  });
}