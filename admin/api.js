/* Thin realtime-DB helpers */
import { db }   from "./firebase-init.js";
import { ref, get, set, push, remove, update } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-database.js";

export const fetchAll = async () => {
  const [stores, users, reviews, guestinfo] = await Promise.all([
    get(ref(db,"stores")),
    get(ref(db,"users")),
    get(ref(db,"reviews")),
    get(ref(db,"guestinfo"))
  ]);
  return {
    stores   : stores.val()   || {},
    users    : users.val()    || {},
    reviews  : reviews.val()  || {},
    guestinfo: guestinfo.val()|| {}
  };
};

/* Generic mutations */
export const dbSet   = (path, val)=> set(ref(db, path), val);
export const dbPush  = (path, val)=> push(ref(db, path), val);
export const dbUpd   = (path, val)=> update(ref(db, path), val);
export const dbDel   = path       => remove(ref(db, path));