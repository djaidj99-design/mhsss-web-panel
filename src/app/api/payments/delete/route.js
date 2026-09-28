// app/api/payments/delete/route.js
// ─────────────────────────────────────────────────────────────────────────────
// Bulk Delete — कई transactions एक साथ हटाएँ
//  • हर transaction की राशि उसकी pending entry के paidAmount से घटाई जाती है
//    (एक ही entry के कई transactions हों तो जोड़ कर एक बार)
//  • हटाए गए transactions की कॉपी deleted_transactions में रखी जाती है (रिकवरी/ऑडिट)
// POST { programId, transactionIds: [] }
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import admin from '../../admin';
import { entryDue, entryPaid, statusFor } from '@/lib/paymentMath';

const adminDb   = admin.firestore();
const adminAuth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const MAX_IDS = 1000;

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

export async function POST(request) {
  try {
    const { uid, error } = await verifyToken(request);
    if (error) return NextResponse.json({ error }, { status: 401 });

    const { programId, transactionIds } = await request.json();
    const ids = [...new Set((transactionIds || []).filter(Boolean))];
    if (!programId || !ids.length) {
      return NextResponse.json({ error: 'programId and transactionIds required' }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `एक बार में अधिकतम ${MAX_IDS} entries delete करें` }, { status: 400 });
    }

    const basePath = `users/${uid}/programs/${programId}`;
    const txRefs = ids.map((id) => adminDb.doc(`${basePath}/transactions/${id}`));
    const txSnaps = [];
    for (let i = 0; i < txRefs.length; i += 300) {
      txSnaps.push(...(await adminDb.getAll(...txRefs.slice(i, i + 300))));
    }

    const found = txSnaps.filter((s) => s.exists);
    const notFound = ids.length - found.length;

    // entryId -> { amount, txIds[] }
    const byEntry = new Map();
    for (const s of found) {
      const t = s.data();
      const entryId = t.paymentPendingId
        || ((t.closingMemberId || t.marriageId) && t.payerId ? `${t.closingMemberId || t.marriageId}_${t.payerId}` : null);
      if (!entryId) continue;
      const cur = byEntry.get(entryId) || { amount: 0, txIds: [], fallbackDue: Number(t.originalClosingAmount) || 0 };
      cur.amount += Number(t.amount) || 0;
      cur.txIds.push(s.id);
      byEntry.set(entryId, cur);
    }

    const entryIds = [...byEntry.keys()];
    const entryRefs = entryIds.map((id) => adminDb.doc(`${basePath}/payment_pending/${id}`));
    const entrySnaps = [];
    for (let i = 0; i < entryRefs.length; i += 300) {
      entrySnaps.push(...(await adminDb.getAll(...entryRefs.slice(i, i + 300))));
    }

    const now = new Date().toISOString();
    const ops = [];

    // 1) audit copy + delete
    for (const s of found) {
      ops.push((b) => b.set(adminDb.doc(`${basePath}/deleted_transactions/${s.id}`), {
        ...s.data(), deletedAt: now, deletedBy: uid, deleteMode: 'bulk',
      }));
      ops.push((b) => b.delete(s.ref));
    }

    // 2) pending entries restore
    let entriesUpdated = 0;
    for (const snap of entrySnaps) {
      if (!snap.exists) continue;
      const entry = snap.data();
      const info = byEntry.get(snap.id);
      const due = entryDue(entry, info.fallbackDue);
      const newPaid = Math.max(0, entryPaid(entry, due) - info.amount);
      const newStatus = statusFor(due, newPaid);
      entriesUpdated++;
      ops.push((b) => b.update(snap.ref, {
        status: newStatus,
        paidAmount: newPaid,
        transactionIds: FieldValue.arrayRemove(...info.txIds),
        ...(newStatus === 'pending'
          ? { transactionId: null, paymentDate: null, paymentMethod: null, onlineReference: null }
          : {}),
        updatedAt: now,
        lastDeletedTransactionId: info.txIds[info.txIds.length - 1],
        lastDeletedAt: now,
      }));
    }

    for (let i = 0; i < ops.length; i += 450) {
      const batch = adminDb.batch();
      ops.slice(i, i + 450).forEach((fn) => fn(batch));
      await batch.commit();
    }

    const deletedAmount = found.reduce((s, x) => s + (Number(x.data().amount) || 0), 0);
    return NextResponse.json({
      success: true,
      deleted: found.length,
      deletedAmount,
      entriesUpdated,
      notFound,
    });
  } catch (err) {
    console.error('[payments/delete]', err);
    return NextResponse.json({ error: 'Server error', details: err.message }, { status: 500 });
  }
}
