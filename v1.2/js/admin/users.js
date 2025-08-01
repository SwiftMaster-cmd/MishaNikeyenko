/* ==========================================================================
   Users Section Styles
   ========================================================================== */

.users-section {
  background: rgba(24, 28, 42, 0.85);
  border-radius: 18px;
  padding: 2rem 2.5rem;
  box-shadow: 0 12px 44px rgba(30, 144, 255, 0.55);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 1.5px solid rgba(30, 144, 255, 0.5);
  color: #cbd5e1;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  user-select: text;
}

.users-section h2 {
  font-weight: 800;
  font-size: 2rem;
  color: #60a5fa;
  margin-bottom: 1.8rem;
  text-shadow: 0 0 5px #3b82f6bb;
  user-select: text;
}

.users-by-store-container {
  display: flex;
  flex-direction: column;
  gap: 1.8rem;
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 6px;
}

.users-by-store-container::-webkit-scrollbar {
  width: 8px;
}

.users-by-store-container::-webkit-scrollbar-track {
  background: rgba(30, 30, 30, 0.3);
  border-radius: 8px;
}

.users-by-store-container::-webkit-scrollbar-thumb {
  background: rgba(30, 144, 255, 0.6);
  border-radius: 8px;
}

.users-by-store-container::-webkit-scrollbar-thumb:hover {
  background: rgba(30, 144, 255, 0.9);
}

/* Store block container */
.user-store-block {
  background: rgba(18, 20, 35, 0.7);
  border-radius: 14px;
  box-shadow: 0 6px 22px rgba(30, 144, 255, 0.45);
  border: 1.5px solid rgba(30, 144, 255, 0.4);
  user-select: text;
  transition: background-color 0.3s ease;
}

/* Expanded store block */
.user-store-block-open {
  background: rgba(30, 144, 255, 0.12);
  box-shadow: 0 0 26px rgba(30, 144, 255, 0.85);
}

/* Store summary row */
.user-store-summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 14px 20px;
  border-radius: 14px 14px 0 0;
  font-weight: 700;
  color: #dbeafe;
  user-select: none;
  border-bottom: 1.5px solid rgba(30, 144, 255, 0.35);
  font-size: 1.1rem;
}

/* Status classes */
.staff-full {
  color: #22c55e; /* green */
  text-shadow: 0 0 8px #22c55ecc;
}

.staff-under {
  color: #facc15; /* amber */
  text-shadow: 0 0 8px #facc1599;
}

.staff-empty {
  color: #6b7280; /* gray */
  text-shadow: none;
}

/* Caret */
.uss-caret {
  font-size: 1.6rem;
  color: #60a5fa;
  min-width: 20px;
  text-align: center;
  user-select: none;
}

/* Store number */
.uss-name {
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Role pills container */
.uss-role-mix {
  display: flex;
  gap: 8px;
  min-width: 80px;
  font-size: 1rem;
}

/* Role pills */
.uss-role-pill {
  padding: 4px 10px;
  border-radius: 9999px;
  color: white;
  font-weight: 700;
  user-select: none;
  box-shadow: 0 0 8px rgba(30, 144, 255, 0.6);
  background-color: #3b82f6;
  transition: background-color 0.3s ease;
}

.uss-role-pill.lead {
  background-color: #10b981; /* green */
  box-shadow: 0 0 10px #10b981cc;
}

.uss-role-pill.me {
  background-color: #60a5fa; /* lighter blue */
  box-shadow: 0 0 10px #60a5faaa;
}

/* Count */
.uss-count {
  font-weight: 700;
  min-width: 60px;
  text-align: center;
}

/* Icon */
.uss-icon {
  font-size: 1.3rem;
  min-width: 24px;
  text-align: center;
}

/* Store goal input (admin only) */
.store-goal-input {
  width: 4.8rem;
  font-size: 1rem;
  padding: 0.3rem 0.5rem;
  border-radius: 12px;
  border: 2px solid rgba(30, 144, 255, 0.5);
  background: rgba(255, 255, 255, 0.07);
  color: #cbd5e1;
  font-weight: 600;
  text-align: center;
  transition: border-color 0.3s ease;
  user-select: text;
}

.store-goal-input:focus {
  outline: none;
  border-color: #4aa8ff;
  box-shadow: 0 0 12px #4aa8ffcc;
}

/* User card */
.user-card {
  background: rgba(20, 25, 38, 0.85);
  border-radius: 12px;
  padding: 1rem 1.2rem;
  margin-top: 1rem;
  box-shadow: 0 4px 14px rgba(30, 144, 255, 0.4);
  color: #cbd5e1;
  font-size: 1rem;
  user-select: text;
  transition: box-shadow 0.3s ease;
}

.user-card:hover {
  box-shadow: 0 8px 30px rgba(30, 144, 255, 0.75);
}

/* User card header */
.user-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.6rem;
}

.user-name {
  font-weight: 700;
  font-size: 1.1rem;
  color: #60a5fa;
  user-select: text;
}

.user-email {
  font-size: 0.9rem;
  color: #a5b4fc;
  user-select: text;
}

/* Role badge */
.role-badge {
  font-weight: 800;
  font-size: 0.85rem;
  padding: 4px 10px;
  border-radius: 9999px;
  user-select: none;
  text-transform: uppercase;
  color: white;
  background-color: #3b82f6;
  box-shadow: 0 0 10px #3b82f6cc;
  white-space: nowrap;
}

.role-badge.role-me {
  background-color: #60a5fa;
  box-shadow: 0 0 12px #60a5faaa;
}

.role-badge.role-lead {
  background-color: #10b981;
  box-shadow: 0 0 12px #10b981cc;
}

.role-badge.role-dm {
  background-color: #2563eb;
  box-shadow: 0 0 12px #2563ebcc;
}

.role-badge.role-admin {
  background-color: #ef4444;
  box-shadow: 0 0 12px #ef4444cc;
}

/* User card info */
.user-card-info {
  display: flex;
  gap: 1.2rem;
  font-size: 0.95rem;
  user-select: text;
  color: #a5b4fc;
}

/* User card actions */
.user-card-actions {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

/* Labels + selects */
.user-card-actions label {
  color: #cbd5e1;
  font-weight: 600;
  user-select: none;
  font-size: 0.9rem;
}

.user-card-actions select {
  margin-left: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07);
  border: 1.5px solid rgba(74, 144, 255, 0.6);
  color: #cbd5e1;
  padding: 4px 8px;
  cursor: pointer;
  transition: border-color 0.3s ease;
  user-select: text;
}

.user-card-actions select:hover,
.user-card-actions select:focus {
  outline: none;
  border-color: #4aa8ff;
  box-shadow: 0 0 14px #4aa8ffcc;
}

/* Delete button */
.btn-danger-outline {
  background: transparent;
  border: 2px solid #ef4444;
  color: #ef4444;
  padding: 0.3rem 0.8rem;
  font-weight: 700;
  font-size: 0.9rem;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  user-select: none;
  white-space: nowrap;
}

.btn-danger-outline:hover {
  background: #ef4444;
  color: white;
  box-shadow: 0 0 14px #ef4444cc;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .users-section {
    padding: 1.5rem 2rem;
  }
  .user-store-summary {
    font-size: 1rem;
    gap: 0.8rem;
  }
  .uss-name {
    font-size: 1rem;
  }
  .uss-role-pill {
    font-size: 0.85rem;
    padding: 3px 8px;
  }
  .user-card {
    font-size: 0.95rem;
  }
  .user-card-info {
    flex-direction: column;
    gap: 0.6rem;
  }
  .user-card-actions label {
    display: block;
    margin-bottom: 0.3rem;
  }
  .user-card-actions select {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .user-store-summary {
    font-size: 0.9rem;
    gap: 0.6rem;
  }
  .uss-caret {
    font-size: 1.3rem;
  }
  .user-card-actions {
    flex-direction: column;
  }
  .user-card-actions select {
    width: 100%;
  }
}