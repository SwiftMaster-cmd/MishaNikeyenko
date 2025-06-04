import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
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