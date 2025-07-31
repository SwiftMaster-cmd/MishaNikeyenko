// gp-firebase.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';

export const firebaseConfig = {
  apiKey: "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain: "osls-644fd.firebaseapp.com",
  databaseURL: "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId: "osls-644fd",
  storageBucket: "osls-644fd.firebasestorage.app",
  messagingSenderId: "798578046321",
  appId: "1:798578046321:web:8758776701786a2fccf2d0",
  measurementId: "G-9HWXNSBE1T"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

export function onAuthStateChanged(callback) {
  return auth.onAuthStateChanged(callback);
}

export async function signIn(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

export function getCurrentUserUid() {
  return auth.currentUser?.uid || null;
}

export async function createNewLead(userUid) {
  const ref = await db.ref("guestinfo").push({
    createdAt: Date.now(),    // lead generation timestamp
    updatedAt: Date.now(),    // set updatedAt on creation
    status: "new",
    userUid: userUid || null
  });
  return ref.key;
}

export async function getGuest(gid) {
  const snap = await db.ref(`guestinfo/${gid}`).get();
  return snap.exists() ? snap.val() : null;
}

export async function updateGuest(gid, data) {
  await db.ref(`guestinfo/${gid}`).update(data);
}

export function attachCompletionListener(gid, onUpdate) {
  const ref = db.ref(`guestinfo/${gid}/completionPct`);
  ref.off("value");
  ref.on("value", snap => {
    if (!snap.exists()) return;
    onUpdate(snap.val());
  });
}