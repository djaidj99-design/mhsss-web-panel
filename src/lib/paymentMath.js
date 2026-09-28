// lib/paymentMath.js
// ─────────────────────────────────────────────────────────────────────────────
// Paid / Pending ka EK hi calculation — har screen, API aur report yahi use kare.
//
// Source of truth = payment_pending entry:
//   payAmount   -> is closing ke liye kitna dena hai (due)
//   paidAmount  -> ab tak kitna jama hua (sab transactions ka jod)
//   status      -> pending | partial | paid  (paidAmount se nikalta hai)
// ─────────────────────────────────────────────────────────────────────────────

export const OPEN_STATUSES = ['pending', 'partial'];

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Is entry ka kul due (payAmount). Missing ho to fallback. */
export const entryDue = (p, fallback = 0) => {
  const n = num(p?.payAmount);
  return n === null ? fallback : n;
};

/** Is entry par ab tak jama rashi. */
export const entryPaid = (p, fallbackDue = 0) => {
  const paid = num(p?.paidAmount);
  if (p?.status === 'paid') return paid && paid > 0 ? paid : entryDue(p, fallbackDue);
  if (p?.status === 'partial') return Math.max(0, paid || 0);
  return 0;
};

/** Is entry par abhi kitna baaki hai. */
export const entryRemaining = (p, fallbackDue = 0) =>
  Math.max(0, entryDue(p, fallbackDue) - entryPaid(p, fallbackDue));

/** Jama rashi se status. */
export const statusFor = (due, paid) => {
  if (paid <= 0) return 'pending';
  if (paid >= due) return 'paid';
  return 'partial';
};

export const isOpenEntry = (p) =>
  p?.delete_flag !== true && (!p?.status || OPEN_STATUSES.includes(p.status));

/**
 * Entries ki list ka summary — member details, agent statement,
 * payment page sab yahi numbers dikhayein.
 */
export const summarizeEntries = (entries = [], fallbackDue = 0) => {
  const s = {
    totalMarriages: 0,
    paidMarriages: 0,
    partialMarriages: 0,
    pendingMarriages: 0, // pending + partial (jin par kuch baaki hai)
    totalAmount: 0,
    paidAmount: 0,
    pendingAmount: 0,
  };
  for (const p of entries) {
    if (p?.delete_flag === true) continue;
    const due = entryDue(p, fallbackDue);
    const paid = entryPaid(p, fallbackDue);
    const rem = Math.max(0, due - paid);
    s.totalMarriages++;
    s.totalAmount += Math.max(due, paid);
    s.paidAmount += paid;
    s.pendingAmount += rem;
    if (rem <= 0) s.paidMarriages++;
    else {
      s.pendingMarriages++;
      if (paid > 0) s.partialMarriages++;
    }
  }
  return s;
};
