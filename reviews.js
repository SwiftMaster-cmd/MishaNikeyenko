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

// renderAuth now adds a Guest Info button when signed in
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
      <button id="guestInfoBtn">Guest Info</button>
      <button id="logoutBtn">Sign out</button>
    `;
    // navigate to guestinfo.html
    document.getElementById('guestInfoBtn').onclick = () => {
      window.location.href = 'guestinfo.html';
    };
    document.getElementById('logoutBtn').onclick = () => auth.signOut();
  }
}

// ... rest of your code remains unchanged ...

function renderTable(data) { /* ... */ }
function renderGuestInfoTable(data) { /* ... */ }

auth.onAuthStateChanged(user => {
  renderAuth(user);
  if (!user) {
    document.getElementById('reviewTable').innerHTML = '';
    document.getElementById('guestInfoTable').innerHTML = '';
    return;
  }

  db.ref('users/' + user.uid).once('value').then(profileSnap => {
    const profile = profileSnap.val();
    if (!profile) {
      document.getElementById('reviewTable').innerHTML = 'Not authorized.';
      document.getElementById('guestInfoTable').innerHTML = '';
      return;
    }

    // DM sees everything
    if (profile.role === 'dm') {
      db.ref('reviews').on('value', snap => renderTable(snap.val()));
      db.ref('guestinfo').on('value', snap => renderGuestInfoTable(snap.val()));
      return;
    }

    // Lead sees only their store's reviews + assigned guests' info
    if (profile.role === 'lead' && profile.store) {
      db.ref('reviews').on('value', snap => {
        const all = snap.val() || {};
        const filtered = {};
        Object.entries(all).forEach(([id, r]) => {
          if (r.store && r.store.trim() === profile.store.trim()) {
            filtered[id] = r;
          }
        });
        renderTable(filtered);
      });

      db.ref('users').once('value').then(usersSnap => {
        const users = usersSnap.val() || {};
        const assignedGuests = Object.keys(users)
          .filter(uid => users[uid].assignedLead === user.uid);

        db.ref('guestinfo').on('value', snap => {
          const allGuestInfo = snap.val() || {};
          const relevant = {};
          Object.entries(allGuestInfo).forEach(([gid, g]) => {
            if (g.userUid && assignedGuests.includes(g.userUid)) {
              relevant[gid] = g;
            }
          });
          renderGuestInfoTable(relevant);
        });
      });
      return;
    }

    // Fallback
    document.getElementById('reviewTable').innerHTML = 'No store assigned to your account.';
    document.getElementById('guestInfoTable').innerHTML = '';
  });
});