import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase init
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

// UI refs
const calendarGrid = document.getElementById('calendar-grid');
const monthLabel = document.getElementById('month-label');
const form = document.getElementById("event-form");
const dateInput = document.getElementById("event-date");
const titleInput = document.getElementById("event-title");
const eventList = document.getElementById("event-list");

let currentUser = null;
let eventsRef = null;
let eventsByDate = {};

function generateCalendar(year, month) {
  calendarGrid.innerHTML = '';
  eventsByDate = {};

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const monthName = firstDay.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  monthLabel.textContent = monthName;

  for (let i = 0; i < startDay; i++) {
    calendarGrid.appendChild(document.createElement('div')); // empty placeholder
  }

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.dataset.date = dateStr;

    const label = document.createElement('div');
    label.textContent = day;
    cell.appendChild(label);

    if (eventsByDate[dateStr]) {
      const dot = document.createElement('div');
      dot.className = 'event-dot';
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => {
      dateInput.value = dateStr;
      titleInput.focus();
    });

    calendarGrid.appendChild(cell);
  }
}

function renderEvents(events) {
  eventsByDate = {};
  eventList.innerHTML = '';

  events.forEach(event => {
    const { date, title } = event;
    if (!eventsByDate[date]) eventsByDate[date] = [];
    eventsByDate[date].push(title);

    const li = document.createElement('li');
    li.textContent = `${date}: ${title}`;
    eventList.appendChild(li);
  });

  const today = new Date();
  generateCalendar(today.getFullYear(), today.getMonth());
}

onAuthStateChanged(auth, user => {
  if (!user) return;
  currentUser = user;
  eventsRef = ref(db, `calendarEvents/${user.uid}`);

  onValue(eventsRef, snapshot => {
    const data = snapshot.val() || {};
    const events = Object.entries(data).map(([id, val]) => ({ id, ...val }));
    renderEvents(events);
  });
});

form.onsubmit = e => {
  e.preventDefault();
  const date = dateInput.value;
  const title = titleInput.value.trim();
  if (!date || !title || !currentUser) return;

  push(ref(db, `calendarEvents/${currentUser.uid}`), {
    date,
    title
  });

  form.reset();
};