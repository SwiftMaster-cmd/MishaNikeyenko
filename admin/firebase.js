/* Firebase bootstrap (exports db + auth) */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getDatabase   } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";
import { getAuth       } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyD9fILTNJQ0wsPftUsPkdLrhRGV9dslMzE",
  authDomain:        "osls-644fd.firebaseapp.com",
  databaseURL:       "https://osls-644fd-default-rtdb.firebaseio.com",
  projectId:         "osls-644fd",
  storageBucket:     "osls-644fd.appspot.com",
  messagingSenderId: "798578046321",
  appId:             "1:798578046321:web:8758776701786a2fccf2d0",
  measurementId:     "G-9HWXNSBE1T"
};

const app  = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);