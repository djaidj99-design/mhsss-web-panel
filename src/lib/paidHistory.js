// lib/paidHistory.js
// ─────────────────────────────────────────────────────────────────────────────
// पूर्ण भुगतान इतिहास (Paid Payment History) — रसीद के लिए डेटा
// Source:
//   1) transactions (status completed, delete_flag false)  -> असली तिथिवार जमा
//   2) payment_pending entries जो paid/partial हैं पर जिनका कोई transaction
//      नहीं मिला (पुराना / माइग्रेटेड डेटा) -> "पुराना भुगतान" पंक्ति
// ─────────────────────────────────────────────────────────────────────────────
import { collection, getDocs, query, where } from 'firebase/firestore';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { db } from './firebase';
import { entryPaid } from './paymentMath';

dayjs.extend(customParseFormat);

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** ISO / Timestamp / DD-MM-YYYY -> dayjs | null */
export const toDay = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return dayjs(v.toDate());
  if (v instanceof Date) return dayjs(v);
  if (typeof v === 'string') {
    const iso = dayjs(v);
    if (iso.isValid() && /^\d{4}-/.test(v)) return iso;
    const d = dayjs(v, ['DD-MM-YYYY', 'DD/MM/YYYY', 'D-M-YYYY', 'D/M/YYYY'], true);
    return d.isValid() ? d : null;
  }
  return null;
};

/**
 * @returns {Promise<Record<payerId, { rows, total, txCount, firstDate, lastDate }>>}
 *   rows: [{ date (dayjs|null), dateLabel, amount, method, reference,
 *            transactionNumber, closingName, closingRegNo, legacy }]
 *   (तिथि के अनुसार पुराने से नए क्रम में)
 */
export async function fetchPaidHistory({ userId, programId, payerIds }) {
  const ids = [...new Set((payerIds || []).filter(Boolean))];
  const result = {};
  ids.forEach((id) => { result[id] = { rows: [], total: 0, txCount: 0 }; });
  if (!userId || !programId || !ids.length) return result;

  const base = `users/${userId}/programs/${programId}`;

  const [txSnaps, pendSnaps] = await Promise.all([
    Promise.all(chunk(ids, 30).map((c) => getDocs(query(
      collection(db, `${base}/transactions`),
      where('payerId', 'in', c),
      where('delete_flag', '==', false),
    )))),
    Promise.all(chunk(ids, 30).map((c) => getDocs(query(
      collection(db, `${base}/payment_pending`),
      where('memberId', 'in', c),
      where('delete_flag', '==', false),
    )))),
  ]);

  const usedEntryIds = new Set();
  const txIdsSeen = new Set();

  for (const snap of txSnaps) {
    for (const d of snap.docs) {
      const t = d.data();
      if (t.status && t.status !== 'completed') continue;
      const r = result[t.payerId];
      if (!r) continue;
      txIdsSeen.add(d.id);
      if (t.paymentPendingId) usedEntryIds.add(t.paymentPendingId);
      const date = toDay(t.paymentDate) || toDay(t.createdAt);
      r.rows.push({
        id: d.id,
        date,
        amount: Number(t.amount) || 0,
        method: t.paymentMethod || '',
        reference: t.onlineReference || '',
        transactionNumber: t.transactionNumber || '',
        closingName: t.closingMemberName || t.marriageMemberName || '',
        closingRegNo: t.closingMemberRegistrationNumber || t.marriageRegistrationNumber || '',
        legacy: false,
      });
    }
  }

  // Paid/partial entries jinka koi transaction nahi mila
  for (const snap of pendSnaps) {
    for (const d of snap.docs) {
      const p = d.data();
      const r = result[p.memberId];
      if (!r) continue;
      const paid = entryPaid(p, Number(p.payAmount) || 0);
      if (paid <= 0) continue;
      const linked = usedEntryIds.has(d.id)
        || (p.transactionId && txIdsSeen.has(p.transactionId))
        || (p.transactionIds || []).some((x) => txIdsSeen.has(x));
      if (linked) continue;
      r.rows.push({
        id: d.id,
        date: toDay(p.paymentDate),
        amount: paid,
        method: p.paymentMethod || '',
        reference: p.onlineReference || '',
        transactionNumber: '',
        closingName: p.paymentFor || '',
        closingRegNo: p.closingRegNo || '',
        legacy: true,
      });
    }
  }

  for (const id of ids) {
    const r = result[id];
    r.rows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.valueOf() - b.date.valueOf();
    });
    r.rows.forEach((x) => { x.dateLabel = x.date ? x.date.format('DD-MM-YYYY') : 'तिथि उपलब्ध नहीं'; });
    r.total = r.rows.reduce((s, x) => s + x.amount, 0);
    r.txCount = r.rows.filter((x) => !x.legacy).length;
    const dated = r.rows.filter((x) => x.date);
    r.firstDate = dated[0]?.dateLabel || '';
    r.lastDate = dated.at(-1)?.dateLabel || '';
  }
  return result;
}

/** rows ko तिथि के अनुसार समूह करो: [{ dateLabel, rows, total }] */
export const groupByDate = (rows) => {
  const groups = [];
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.dateLabel)) {
      const g = { dateLabel: r.dateLabel, rows: [], total: 0 };
      map.set(r.dateLabel, g);
      groups.push(g);
    }
    const g = map.get(r.dateLabel);
    g.rows.push(r);
    g.total += r.amount;
  }
  return groups;
};
