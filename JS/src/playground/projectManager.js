// projectManager.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, push, update, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// -- Firebase Init (use your posted config) --
const firebaseConfig = {
  apiKey: "AIzaSyCf_se10RUg8i_u8pdowHlQvrFViJ4jh_Q",
  authDomain: "mishanikeyenko.firebaseapp.com",
  databaseURL: "https://mishanikeyenko-default-rtdb.firebaseio.com",
  projectId: "mishanikeyenko",
  storageBucket: "mishanikeyenko.firebasestorage.app",
  messagingSenderId: "1089190937368",
  appId: "1:1089190937368:web:959c825fc596a5e3ae946d",
  measurementId: "G-L6CC27129C"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// -- Auth helper: Anonymous sign-in --
export async function getUID() {
  if (auth.currentUser) return auth.currentUser.uid;
  await signInAnonymously(auth);
  return new Promise(resolve => {
    auth.onAuthStateChanged(user => resolve(user.uid));
  });
}

// -- Project CRUD --
export async function createProject({ name, language = "JavaScript" }) {
  const uid = await getUID();
  const projectId = `p_${Date.now()}`;
  const project = {
    id: projectId,
    name,
    language,
    created: Date.now(),
    history: {}
  };
  const projectRef = ref(db, `playgroundProjects/${uid}/${projectId}`);
  await set(projectRef, project);
  return project;
}

export async function listProjects() {
  const uid = await getUID();
  const projectsRef = ref(db, `playgroundProjects/${uid}`);
  const snap = await get(projectsRef);
  const all = snap.exists() ? snap.val() : {};
  // Sort newest first
  return Object.values(all).sort((a, b) => b.created - a.created);
}

export async function loadProject(projectId) {
  const uid = await getUID();
  const projectRef = ref(db, `playgroundProjects/${uid}/${projectId}`);
  const snap = await get(projectRef);
  if (!snap.exists()) throw new Error("Project not found");
  return snap.val();
}

export async function deleteProject(projectId) {
  const uid = await getUID();
  const projectRef = ref(db, `playgroundProjects/${uid}/${projectId}`);
  await remove(projectRef);
}

// -- History management --
export async function addHistory(projectId, { code, review, prompt, isBest = false }) {
  const uid = await getUID();
  const historyRef = ref(db, `playgroundProjects/${uid}/${projectId}/history`);
  const newEntryRef = push(historyRef);
  const entry = {
    id: newEntryRef.key,
    code,
    review,
    prompt,
    timestamp: Date.now(),
    isBest
  };
  await set(newEntryRef, entry);
  if (isBest) await markBestVersion(projectId, entry.id);
  return entry;
}

export async function listHistory(projectId) {
  const uid = await getUID();
  const historyRef = ref(db, `playgroundProjects/${uid}/${projectId}/history`);
  const snap = await get(historyRef);
  const all = snap.exists() ? snap.val() : {};
  // Sort oldest to newest
  return Object.values(all).sort((a, b) => a.timestamp - b.timestamp);
}

export async function markBestVersion(projectId, historyId) {
  const uid = await getUID();
  const historyRef = ref(db, `playgroundProjects/${uid}/${projectId}/history`);
  const snap = await get(historyRef);
  if (!snap.exists()) return;
  const all = snap.val();
  await Promise.all(Object.keys(all).map(key =>
    update(ref(db, `playgroundProjects/${uid}/${projectId}/history/${key}`), {
      isBest: key === historyId
    })
  ));
}

export async function getBestVersion(projectId) {
  const history = await listHistory(projectId);
  return history.find(h => h.isBest) || history[history.length - 1] || null;
}