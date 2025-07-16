// ui.js
import { getAllStores, assignTL, addStore, updateStoreNumber, deleteStore, editStorePrompt, renderStores } from './store.js';
import { getAllUsers, changeUserRole, assignLeadToGuest, assignDMToLead, deleteUser, renderUsers } from './user.js';
import { getAllReviews, toggleStar, deleteReview, renderReviews, filterReviewsByStore, filterReviewsByAssociate, clearReviewFilter } from './review.js';
import { getAllGuestInfo, renderGuestInfo } from './guest.js';
import { auth } from './firebaseConfig.js';

const adminAppDiv = document.getElementById('adminApp');

export async function renderAdminApp() {
  adminAppDiv.innerHTML = "<div>Loading data...</div>";

  const [stores, users, reviews, guestinfo] = await Promise.all([
    getAllStores(),
    getAllUsers(),
    getAllReviews(),
    getAllGuestInfo()
  ]);

  const storesHtml = renderStores(stores, users);
  const usersHtml = renderUsers(users);
  const reviewsHtml = renderReviews(reviews);
  const guestInfoHtml = renderGuestInfo(guestinfo, users);

  adminAppDiv.innerHTML = `
    <div class="admin-section">
      <div class="section-title">Store Management</div>
      ${storesHtml}
    </div>
    <div class="admin-section">
      <div class="section-title">User Management</div>
      ${usersHtml}
    </div>
    <div class="admin-section">
      <div class="section-title">All Reviews</div>
      <button onclick="window.renderAdminApp()" style="float:right;margin-bottom:8px;">Reload</button>
      <button onclick="window.clearReviewFilter()" style="float:right;margin-bottom:8px;margin-right:10px;">Clear Filter</button>
      <div id="filteredReviews">${reviewsHtml}</div>
    </div>
    <div class="admin-section">
      <div class="section-title">All Guest Info</div>
      ${guestInfoHtml}
    </div>
  `;

  // Save global states for filtering etc
  window._allReviews = Object.entries(reviews);
  window._allReviewsHtml = reviewsHtml;
  window._users = users;
  window._stores = stores;

  // Bind global functions for inline handlers
  window.changeUserRole = changeUserRole;
  window.assignLeadToGuest = assignLeadToGuest;
  window.assignDMToLead = assignDMToLead;
  window.deleteUser = deleteUser;
  window.toggleStar = toggleStar;
  window.deleteReview = deleteReview;
  window.assignTL = assignTL;
  window.addStore = addStore;
  window.updateStoreNumber = updateStoreNumber;
  window.deleteStore = deleteStore;
  window.editStorePrompt = editStorePrompt;
  window.filterReviewsByStore = (store) => filterReviewsByStore(store, window._allReviews);
  window.filterReviewsByAssociate = (associate) => filterReviewsByAssociate(associate, window._allReviews);
  window.clearReviewFilter = () => clearReviewFilter(window._allReviewsHtml);
}