import { updateGuest, getGuest } from './gp-firebase.js';
import { detectStatus, normGuest, computeGuestPitchQuality } from './gp-core.js';

const saveQueue = {};
let saveTimer = null;

function debounceSave(guestKey, delay = 500) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flushSave(guestKey);
  }, delay);
}

async function flushSave(guestKey) {
  if (!guestKey || Object.keys(saveQueue).length === 0) return;

  // Prepare update payload
  const updatePayload = {};
  for (const [field, value] of Object.entries(saveQueue)) {
    if (field === 'custName' || field === 'custPhone') {
      updatePayload[field] = value;
    } else if (field === 'solutionText') {
      updatePayload['solution'] = { text: value, completedAt: Date.now() };
    } else {
      updatePayload[`evaluate/${field}`] = value;
    }
  }

  saveQueueClear();

  try {
    await updateGuest(guestKey, updatePayload);

    // Fetch updated guest to recompute status and completion
    const freshGuest = await getGuest(guestKey);
    if (!freshGuest) return;

    const normalized = normGuest(freshGuest);
    const newStatus = detectStatus(normalized);

    if (newStatus !== freshGuest.status) {
      await updateGuest(guestKey, { status: newStatus, updatedAt: Date.now() });
    }

    const comp = computeGuestPitchQuality(normalized);
    await updateGuest(guestKey, { completionPct: comp.pct });

    // Optional: trigger event or callback to update UI progress bar here

  } catch (err) {
    console.error("Error saving guest data:", err);
  }
}

function saveQueueClear() {
  for (const key in saveQueue) delete saveQueue[key];
}

export function saveField(guestKey, fieldId, value) {
  if (!guestKey) return;
  saveQueue[fieldId] = value;
  debounceSave(guestKey);
}