// 🔹 chat.js

import { db, auth } from "./firebaseConfig.js";
import {
  getMemory, getDayLog, getNotes,
  getCalendar, getReminders, getCalcHistory,
  buildSystemPrompt
} from "./memoryManager.js";
import {
  handleStaticCommand, listNotes,
  listReminders, listEvents
} from "./commandHandlers.js";
import { detectMemoryType, extractJson } from "./chatUtils.js";

import {
  addDebugMessage, createDebugOverlay, showDebugOverlay
} from "./debugOverlay.js";
import { initScroll } from "./scrollManager.js";
import { renderMessages } from "./messageRenderer.js";
import { askGPT, saveMemoryIfNeeded, maybeSaveSummary } from "./gptMemory.js";

const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");
const log = document.getElementById("chat-log");
const debugToggle = document.getElementById("debug-toggle");

createDebugOverlay();
debugToggle?.addEventListener("click", showDebugOverlay);

const scrollToBottom = initScroll(log);

let uid = null;
let chatRef = null;

// Auth & chat listener
onAuthStateChanged(auth, user => {
  if (!user) {
    signInAnonymously(auth);
    addDebugMessage("Signed in anonymously");
    return;
  }
  uid = user.uid;
  chatRef = ref(db, `chatHistory/${uid}`);
  onValue(chatRef, snap => {
    const data = snap.val()||{};
    const msgs = Object.values(data).map(m=>({
      role: m.role==="bot"?"assistant":m.role,
      content: m.content, timestamp: m.timestamp||0
    }));
    renderMessages(log, msgs.slice(-20), scrollToBottom);
  });
});

// Send flow
form.addEventListener("submit", async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !chatRef || !uid) return;
  input.value = "";

  // static/listing
  const cmds = ["/time","/date","/uid","/clearchat","/summary","/commands"];
  if (cmds.includes(text)) {
    await handleStaticCommand(text, chatRef, uid);
    return;
  }
  if (text==="/notes")     { await listNotes(chatRef);     return; }
  if (text==="/reminders") { await listReminders(chatRef); return; }
  if (text==="/events")    { await listEvents(chatRef);    return; }

  // push user
  await push(chatRef, { role:"user", content:text, timestamp:Date.now() });

  // gather context + reply
  (async () => {
    const today = new Date().toISOString().slice(0,10);
    // fetch last 20
    const snap = await get(child(ref(db), `chatHistory/${uid}`));
    const all = snap.exists() ? snap.val() : {};
    const last20 = Object.values(all)
      .map(m=>({ role: m.role==="bot"?"assistant":m.role, content:m.content, timestamp:m.timestamp||0 }))
      .sort((a,b)=>a.timestamp-b.timestamp)
      .slice(-20);

    // fetch memory
    const [memory, dayLog, notes, cal, rem, calc] = await Promise.all([
      getMemory(uid), getDayLog(uid,today), getNotes(uid),
      getCalendar(uid), getReminders(uid), getCalcHistory(uid)
    ]);
    const sys = buildSystemPrompt({
      memory, todayLog: dayLog,
      notes, calendar: cal,
      reminders: rem, calc, date: today
    });
    const convo = [{ role:"system", content:sys }, ...last20];

    // save any notes/reminders
    await saveMemoryIfNeeded(uid, text, detectMemoryType, extractJson, today);

    // ask GPT & push reply
    const reply = await askGPT(convo, "gpt-4o", 0.8);
    await push(chatRef, { role:"assistant", content:reply, timestamp:Date.now() });

    // maybe summary
    await maybeSaveSummary(uid);
  })();
});