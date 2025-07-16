const db = firebase.database();

// Fetch all reviews
export async function fetchReviews() {
  try {
    const reviewsSnap = await db.ref('reviews').get();
    return reviewsSnap.val() || {};
  } catch (error) {
    console.error("Error fetching reviews:", error);
    throw error;
  }
}

// Toggle star on review
export async function toggleStar(reviewId, starred) {
  try {
    await db.ref(`reviews/${reviewId}/starred`).set(!starred);
  } catch (error) {
    console.error(`Error toggling star for review ${reviewId}:`, error);
    throw error;
  }
}

// Delete review
export async function deleteReview(reviewId) {
  try {
    await db.ref(`reviews/${reviewId}`).remove();
  } catch (error) {
    console.error(`Error deleting review ${reviewId}:`, error);
    throw error;
  }
}