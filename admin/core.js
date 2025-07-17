// core.js
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
const db   = firebase.database();
const auth = firebase.auth();

const ROLES = { ME: "me", LEAD: "lead", DM: "dm", ADMIN: "admin" };
let currentUid = null;
let currentRole = ROLES.ME;

const canEdit   = r => r !== ROLES.ME;
const canDelete = r => r === ROLES.DM || r === ROLES.ADMIN;

function assertEdit()   { if (!canEdit(currentRole)) throw "PERM_DENIED_EDIT"; }
function assertDelete() { if (!canDelete(currentRole)) throw "PERM_DENIED_DELETE"; }

const roleBadge = r => `<span class="role-badge role-${r}">${r.toUpperCase()}</span>`;