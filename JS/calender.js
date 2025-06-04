import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase config
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

const form = document.getElementById("event-form");
const dateInput = document.getElementById("event-date");
const titleInput = document.getElementById("event-title");
const eventList = document.getElementById("event-list");

let eventsRef = null;

function renderEvents(events) {
  eventList.innerHTML = '';
  events.sort((a, b) => a.date.localeCompare(b.date));
  events.forEach(event => {
    const li = document.createElement('li');
    li.textContent = `${event.date}: ${event.title}`;
    const delBtn = document.createElement('button');
    delBtn.textContent = "❌";
    delBtn.onclick = () => remove(ref(db, `${eventsRef}/${event.id}`));
    li.appendChild(delBtn);
    eventList.appendChild(li);
  });
}

onAuthStateChanged(auth, user => {
  if (!user) {
    console.warn("Not signed in");
    return;
  }

  eventsRef = `calendarEvents/${user.uid}`;
  const userRef = ref(db, eventsRef);

  onValue(userRef, snapshot => {
    const data = snapshot.val() || {};
    const events = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    renderEvents(events);
  });

  form.onsubmit = e => {
    e.preventDefault();
    const date = dateInput.value;
    const title = titleInput.value.trim();
    if (!date || !title) return;

    push(userRef, { date, title });
    form.reset();
  };
});