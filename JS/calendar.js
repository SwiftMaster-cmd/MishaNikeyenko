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
const calendarGrid = document.getElementById("calendar-grid");
const monthLabel = document.getElementById("month-label");

let eventsRef = null;

function renderEventsList(events) {
  eventList.innerHTML = '';
  events.sort((a, b) => a.date.localeCompare(b.date));
  events.forEach(event => {
    const li = document.createElement('li');
    li.innerHTML = `${event.date}: ${event.title}`;
    const delBtn = document.createElement('button');
    delBtn.textContent = "❌";
    delBtn.onclick = () => remove(ref(db, `${eventsRef}/${event.id}`));
    li.appendChild(delBtn);
    eventList.appendChild(li);
  });
}

function renderCalendarGrid(events) {
  const today = new Date().toISOString().split('T')[0];
  const eventDates = new Set(events.map(e => e.date));

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const start = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  calendarGrid.innerHTML = '';
  monthLabel.textContent = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  for (let i = 0; i < start; i++) {
    const spacer = document.createElement('div');
    spacer.className = 'day empty';
    calendarGrid.appendChild(spacer);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayBox = document.createElement('div');
    dayBox.className = 'day';
    if (dateStr === today) dayBox.classList.add('today');
    if (eventDates.has(dateStr)) dayBox.classList.add('has-event');
    dayBox.textContent = d;
    calendarGrid.appendChild(dayBox);
  }
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
    renderEventsList(events);
    renderCalendarGrid(events);
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