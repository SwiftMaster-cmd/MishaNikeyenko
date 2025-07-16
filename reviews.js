// --- Firebase config ---
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
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

function renderAuth(user) {
  const el = document.getElementById('authDiv');
  if (!user) {
    el.innerHTML = `<button id="loginBtn">Sign in with Google</button>`;
    document.getElementById('loginBtn').onclick = () => {
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    };
  } else {
    el.innerHTML = `
      <span>Signed in as <b>${user.email}</b></span>
      <button id="logoutBtn">Sign out</button>
    `;
    document.getElementById('logoutBtn').onclick = () => auth.signOut();
  }
}

function renderTable(data) {
  if (!data || Object.keys(data).length === 0) {
    document.getElementById('reviewTable').innerHTML = 'No reviews found.';
    return;
  }
  const reviews = Object.values(data).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  document.getElementById('reviewTable').innerHTML = `
    <table border="0" cellpadding="7" class="review-table">
      <thead>
        <tr>
          <th>Store</th>
          <th>Associate</th>
          <th>Rating</th>
          <th>Review</th>
          <th>Referral</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        ${reviews.map(r => `
          <tr>
            <td>${r.store || ''}</td>
            <td>${r.associate || ''}</td>
            <td>${'★'.repeat(r.rating || 0)}</td>
            <td>${r.comment || ''}</td>
            <td>${r.refName ? r.refName + ' / ' + r.refPhone : ''}</td>
            <td>${r.timestamp ? new Date(r.timestamp).toLocaleString() : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- NEW: Guest info render function ---
function renderGuestInfoTable(data) {
  if (!data || Object.keys(data).length === 0) {
    document.getElementById('guestInfoTable').innerHTML = 'No guest info found.';
    return;
  }
  const infos = Object.values(data).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  document.getElementById('guestInfoTable').innerHTML = `
    <table border="0" cellpadding="7" class="guestinfo-table">
      <thead>
        <tr>
          <th>Customer Name</th>
          <th>Customer Phone</th>
          <th>Service Type</th>
          <th>Situation</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        ${infos.map(g => `
          <tr>
            <td>${g.custName || ''}</td>
            <td>${g.custPhone || ''}</td>
            <td>${g.serviceType || ''}</td>
            <td>${g.situation || ''}</td>
            <td>${g.submittedAt ? new Date(g.submittedAt).toLocaleString() : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// --- Auth state and main logic ---
let currentUser = null;
auth.onAuthStateChanged(user => {
  currentUser = user;
  renderAuth(user);
  if (user) {
    db.ref('users/' + user.uid).once('value').then(snap => {
      const profile = snap.val();
      if (!profile) {
        document.getElementById('reviewTable').innerHTML = 'Not authorized.';
        document.getElementById('guestInfoTable').innerHTML = '';
        return;
      }
      if (profile.role === 'dm') {
        // DM: see all reviews
        db.ref('reviews').on('value', snap => {
          renderTable(snap.val());
        });
        // DM: see all guest info
        db.ref('guestinfo').on('value', snap => {
          renderGuestInfoTable(snap.val());
        });
      } else if (profile.role === 'lead' && profile.store) {
        // Team Lead: only their store's reviews
        db.ref('reviews').on('value', snap => {
          const all = snap.val() || {};
          const filtered = {};
          Object.entries(all).forEach(([id, r]) => {
            if (r.store && r.store.trim() === profile.store.trim()) filtered[id] = r;
          });
          renderTable(filtered);
        });
        // Team Lead: guest info for guests assigned to them
        db.ref('users').once('value').then(usersSnap => {
          const users = usersSnap.val() || {};
          const assignedGuests = Object.keys(users).filter(uid =>
            users[uid].assignedLead === user.uid
          );
          db.ref('guestinfo').on('value', snap => {
            const allGuestInfo = snap.val() || {};
            const relevant = {};
            Object.entries(allGuestInfo).forEach(([gid, g]) => {
              if (g.userUid && assignedGuests.includes(g.userUid)) relevant[gid] = g;
            });
            renderGuestInfoTable(relevant);
          });
        });
      } else {
        document.getElementById('reviewTable').innerHTML = 'No store assigned to your account.';
        document.getElementById('guestInfoTable').innerHTML = '';
      }
    });
  } else {
    document.getElementById('reviewTable').innerHTML = '';
    document.getElementById('guestInfoTable').innerHTML = '';
  }
});