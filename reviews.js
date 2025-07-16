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

let currentUser = null;
auth.onAuthStateChanged(user => {
  currentUser = user;
  renderAuth(user);
  if (user) {
    // Find role and store (from /users)
    db.ref('users/' + user.uid).once('value').then(snap => {
      const profile = snap.val();
      if (!profile) {
        document.getElementById('reviewTable').innerHTML = 'Not authorized.';
        return;
      }
      if (profile.role === 'dm') {
        // DM: see all reviews
        db.ref('reviews').on('value', snap => {
          renderTable(snap.val());
        });
      } else if (profile.role === 'lead' && profile.store) {
        // Team Lead: only their store
        db.ref('reviews').on('value', snap => {
          const all = snap.val() || {};
          const filtered = {};
          Object.entries(all).forEach(([id, r]) => {
            if (r.store && r.store.trim() === profile.store.trim()) filtered[id] = r;
          });
          renderTable(filtered);
        });
      } else {
        document.getElementById('reviewTable').innerHTML = 'No store assigned to your account.';
      }
    });
  } else {
    document.getElementById('reviewTable').innerHTML = '';
  }
});