// app/api/payments/reconcile/route.js
// ─────────────────────────────────────────────────────────────────────────────
// भुगतान मिलान (Reconciliation)
// Transactions (असली जमा पैसा) और payment_pending entries (paid/pending status)
// को मिलाता है। GET = सिर्फ़ रिपोर्ट, POST = सुधार लागू करें।
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import admin from '../../admin';
import { entryDue, entryPaid, statusFor } from '@/lib/paymentMath';

const adminDb   = admin.firestore();
const adminAuth = admin.auth();

async function verifyToken(request) {
  const token = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) return { uid: null, error: 'Unauthorized' };
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, error: null };
  } catch {
    return { uid: null, error: 'Invalid or expired token' };
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

async function analyse(uid, programId, { resetPaidWithoutTx = false, memberId = null } = {}) {
  const basePath = `users/${uid}/programs/${programId}`;

  // memberId diya ho to sirf us sadasya ka milan (Member Payment Details se)
  const pendQ = memberId
    ? adminDb.collection(`${basePath}/payment_pending`).where('memberId', '==', memberId)
    : adminDb.collection(`${basePath}/payment_pending`);
  let txQ = adminDb.collection(`${basePath}/transactions`)
    .where('status', '==', 'completed')
    .where('delete_flag', '==', false);
  if (memberId) txQ = txQ.where('payerId', '==', memberId);

  const [pendSnap, txSnap] = await Promise.all([pendQ.get(), txQ.get()]);

  const entries = pendSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.delete_flag !== true);

  const entryById   = new Map(entries.map(p => [p.id, p]));
  const entryByPair = new Map();
  for (const p of entries) {
    const cid = p.closingMemberId || p.marriageId;
    if (cid && p.memberId) entryByPair.set(`${p.memberId}|${cid}`, p);
  }

  // ── har transaction ko uski entry se jodo ────────────────────────────────
  const paidByEntry = new Map(); // entryId -> { sum, txIds[] }
  const orphanTx = [];
  let totalTxAmount = 0;

  for (const d of txSnap.docs) {
    const tx  = d.data();
    const amt = Number(tx.amount) || 0;
    totalTxAmount += amt;
    const cid = tx.closingMemberId || tx.marriageId;

    let entry = tx.paymentPendingId ? entryById.get(tx.paymentPendingId) : null;
    if (!entry && cid && tx.payerId) {
      entry = entryById.get(`${cid}_${tx.payerId}`) || entryByPair.get(`${tx.payerId}|${cid}`);
    }

    if (!entry) {
      orphanTx.push({
        txId: d.id,
        transactionNumber: tx.transactionNumber || '',
        amount: amt,
        payerId: tx.payerId || '',
        payerName: tx.payerName || '',
        payerRegNo: tx.payerRegistrationNumber || '',
        closingName: tx.closingMemberName || tx.marriageMemberName || '',
        closingRegNo: tx.closingMemberRegistrationNumber || tx.marriageRegistrationNumber || '',
        paymentDate: tx.paymentDate || tx.createdAt || '',
      });
      continue;
    }
    const cur = paidByEntry.get(entry.id) || { sum: 0, txIds: [] };
    cur.sum += amt;
    cur.txIds.push(d.id);
    paidByEntry.set(entry.id, cur);
  }

  // ── har entry ka sahi status nikaalo ─────────────────────────────────────
  const fixes = [];
  const paidWithoutTx = [];
  const overpaid = [];
  let entryPaidBefore = 0;
  let entryPaidAfter  = 0;

  for (const p of entries) {
    const due        = entryDue(p, 0);
    const storedPaid = entryPaid(p, 0);
    const storedStat = p.status || 'pending';
    const tx         = paidByEntry.get(p.id);
    const txPaid     = round2(tx?.sum || 0);
    entryPaidBefore += storedPaid;

    const info = {
      entryId: p.id,
      payerId: p.memberId,
      payerName: p.memberDetails?.displayName || '',
      payerRegNo: p.memberDetails?.registrationNumber || '',
      agentId: p.memberDetails?.agentId || '',
      closingName: p.paymentFor || '',
      closingRegNo: p.closingRegNo || '',
      due,
      oldStatus: storedStat,
      oldPaid: storedPaid,
      txPaid,
    };

    // Entry me transactions se ZYADA jama dikh raha hai (purana / manual / migrated data).
    // Ye apne-aap kam nahi kiya jata — sirf switch on karne par transactions ke barabar hoga.
    if (storedPaid > txPaid) {
      paidWithoutTx.push({ ...info, missing: round2(storedPaid - txPaid) });
      if (resetPaidWithoutTx) {
        const newStatus = statusFor(due, txPaid);
        fixes.push({ ...info, newStatus, newPaid: txPaid, txIds: tx?.txIds || [] });
        entryPaidAfter += txPaid;
      } else {
        entryPaidAfter += storedPaid;
      }
      continue;
    }

    // Admin ne jise PAID kiya hai use kabhi partial/pending nahi karna.
    // Pichhle version ne kuch paid entries ko partial kar diya tha
    // (reconcileNote "paid/..."), unhe wapas paid karo.
    const wasPaidBefore = typeof p.reconcileNote === 'string' && p.reconcileNote.startsWith('paid/');
    const keepPaid = (storedStat === 'paid' || wasPaidBefore) && txPaid > 0;
    const newStatus = keepPaid
      ? 'paid'
      : (due <= 0 && txPaid > 0 ? 'paid' : statusFor(due, txPaid));
    if (txPaid > due && due > 0) overpaid.push({ ...info, extra: round2(txPaid - due) });
    entryPaidAfter += txPaid;

    const statusWrong = newStatus !== storedStat;
    const paidWrong   = round2(Number(p.paidAmount) || 0) !== txPaid && !(txPaid === 0 && !p.paidAmount);
    if (statusWrong || paidWrong) {
      fixes.push({ ...info, newStatus, newPaid: txPaid, txIds: tx?.txIds || [] });
    }
  }

  // ── Duplicate: ek hi sadasya + ek hi closing ki 2 entries ──────────────
  // Ek paid ho jaati hai aur doosri pending dikhti rehti hai.
  const duplicates = [];
  const pairGroups = new Map();
  for (const p of entries) {
    const cid = p.closingMemberId || p.marriageId;
    if (!cid || !p.memberId) continue;
    const k = `${p.memberId}|${cid}`;
    if (!pairGroups.has(k)) pairGroups.set(k, []);
    pairGroups.get(k).push(p);
  }
  for (const list of pairGroups.values()) {
    if (list.length < 2) continue;
    // jise rakhna hai: jiska transaction/paid ho, warna standard id wali
    const score = (p) => (paidByEntry.get(p.id)?.sum || 0) * 10 + (p.status === 'paid' ? 5 : 0)
      + (p.id === `${p.closingMemberId || p.marriageId}_${p.memberId}` ? 1 : 0);
    const keep = [...list].sort((a, b) => score(b) - score(a))[0];
    for (const p of list) {
      if (p.id === keep.id || (paidByEntry.get(p.id)?.sum || 0) > 0) continue;
      duplicates.push({
        entryId: p.id, keepId: keep.id,
        payerName: p.memberDetails?.displayName || '', payerRegNo: p.memberDetails?.registrationNumber || '',
        closingName: p.paymentFor || '', closingRegNo: p.closingRegNo || '',
        status: p.status || 'pending', keepStatus: keep.status || 'pending',
      });
    }
  }

  const orphanAmount = orphanTx.reduce((s, t) => s + t.amount, 0);

  return {
    fixes,
    summary: {
      entries: entries.length,
      transactions: txSnap.size,
      totalTxAmount: round2(totalTxAmount),
      entryPaidBefore: round2(entryPaidBefore),
      entryPaidAfter: round2(entryPaidAfter),
      fixCount: fixes.length,
      paidWithoutTxCount: paidWithoutTx.length,
      paidWithoutTxAmount: round2(paidWithoutTx.reduce((s, x) => s + x.missing, 0)),
      overpaidCount: overpaid.length,
      overpaidAmount: round2(overpaid.reduce((s, x) => s + x.extra, 0)),
      orphanTxCount: orphanTx.length,
      orphanTxAmount: round2(orphanAmount),
      duplicateCount: duplicates.length,
    },
    duplicates,
    paidWithoutTx,
    overpaid,
    orphanTx,
  };
}

// GET /api/payments/reconcile?programId=...  -> preview (kuch nahi badalta)
export async function GET(request) {
  try {
    const { uid, error } = await verifyToken(request);
    if (error) return NextResponse.json({ error }, { status: 401 });
    const sp = new URL(request.url).searchParams;
    const programId = sp.get('programId');
    const memberId = sp.get('memberId') || null;
    if (!programId) return NextResponse.json({ error: 'programId required' }, { status: 400 });

    const result = await analyse(uid, programId, { memberId });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[payments/reconcile GET]', err);
    return NextResponse.json({ error: 'Server error', details: err.message }, { status: 500 });
  }
}

// POST { programId, resetPaidWithoutTx? } -> sudhaar lagao
export async function POST(request) {
  try {
    const { uid, error } = await verifyToken(request);
    if (error) return NextResponse.json({ error }, { status: 401 });
    const { programId, resetPaidWithoutTx = false, memberId = null } = await request.json();
    if (!programId) return NextResponse.json({ error: 'programId required' }, { status: 400 });

    const { fixes, summary, duplicates } = await analyse(uid, programId, { resetPaidWithoutTx, memberId });
    const basePath = `users/${uid}/programs/${programId}`;
    const now = new Date().toISOString();

    for (let i = 0; i < fixes.length; i += 450) {
      const batch = adminDb.batch();
      for (const f of fixes.slice(i, i + 450)) {
        batch.update(adminDb.doc(`${basePath}/payment_pending/${f.entryId}`), {
          status: f.newStatus,
          paidAmount: f.newPaid,
          transactionIds: f.txIds,
          transactionId: f.txIds.length ? f.txIds[f.txIds.length - 1] : null,
          reconciledAt: now,
          reconcileNote: `${f.oldStatus}/${f.oldPaid} -> ${f.newStatus}/${f.newPaid}`,
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    // Duplicate (bina paise wali) entries ko chhupao — delete nahi, delete_flag
    for (let i = 0; i < duplicates.length; i += 450) {
      const batch = adminDb.batch();
      for (const d of duplicates.slice(i, i + 450)) {
        batch.update(adminDb.doc(`${basePath}/payment_pending/${d.entryId}`), {
          delete_flag: true,
          duplicateOf: d.keepId,
          reconciledAt: now,
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, fixed: fixes.length, duplicatesHidden: duplicates.length, summary });
  } catch (err) {
    console.error('[payments/reconcile POST]', err);
    return NextResponse.json({ error: 'Server error', details: err.message }, { status: 500 });
  }
}
