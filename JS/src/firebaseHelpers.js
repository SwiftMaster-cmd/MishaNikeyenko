import { db } from "./firebaseConfig.js";
import {
  ref,
  get,
  set,
  push,
  child
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

export async function fetchNode(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : {};
}

export async function writeNode(path, data) {
  await set(ref(db, path), data);
}

export async function appendNode(path, entry) {
  await push(ref(db, path), entry);
}

export async function readChild(path, childKey) {
  const snap = await get(child(ref(db, path), childKey));
  return snap.exists() ? snap.val() : {};
}