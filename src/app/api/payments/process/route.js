// app/api/payments/process/route.js
import { NextResponse } from 'next/server';
import admin from '../../admin';
import {
  entryDue, entryPaid, entryRemaining, statusFor, isOpenEntry,
} from '@/lib/paymentMath';

const adminDb = admin.firestore();
const adminAuth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

// ═══════════════════════════════════════════════════════════════════════════
// SMART BATCH
// ═══════════════════════════════════════════════════════════════════════════
class SmartBatch {
  constructor(db) {
    this.db      = db;
    this.batch   = db.batch();
    this.ops     = 0;
    this.commits = [];
  }
  set(ref, data) {
    this.batch.set(ref, data);
    this._maybeFlush();
  }
  update(ref, data) {
    this.batch.update(ref, data);
    this._maybeFlush();
  }
  _maybeFlush() {
    this.ops++;
    if (this.ops >= 480) {
      this.commits.push(this.batch.commit());
      this.batch = this.db.batch();
      this.ops   = 0;
    }
  }
  async commit() {
    if (this.ops > 0) this.commits.push(this.batch.commit());
    return Promise.all(this.commits);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
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

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function createSearchIndex(words) {
  const tokens = new Set();
  for (const w of words) {
    if (!w) continue;
    const s = String(w).toLowerCase().trim();
    for (let i = 1; i <= s.length; i++) tokens.add(s.slice(0, i));
  }
  return [...tokens];
}

async function isDuplicateRef(uid, programId, ref) {
  const snap = await adminDb
    .collection(`users/${uid}/programs/${programId}/transactions`)
    .where('onlineReference', '==', ref)
    .where('delete_flag', '==', false)
    .limit(1)
    .get();
  return !snap.empty;
}

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function batchGetDocs(basePath, col, ids) {
  if (!ids.length) return {};
  const snaps = await Promise.all(
    ids.map((id) => adminDb.doc(`${basePath}/${col}/${id}`).get())
  );
  const map = {};
  for (const s of snaps) {
    if (s.exists) map[s.id] = { id: s.id, ...s.data() };
  }
  return map;
}

/** Payer ki entries ko closingId ke hisaab se map karo (open entry ko priority). */
function mapEntriesByClosing(entries) {
  const map = {};
  for (const p of entries) {
    if (p.delete_flag === true) continue;
    const key = p.closingMemberId || p.marriageId;
    if (!key) continue;
    if (!map[key] || (isOpenEntry(p) && !isOpenEntry(map[key]))) map[key] = p;
  }
  return map;
}

/** Pending entry ka update — paidAmount JODTA hai, overwrite nahi karta. */
function buildEntryUpdate({ entry, due, prevPaid, pay, txId, paymentMethod, onlineReference }) {
  const newPaid = prevPaid + pay;
  const status  = statusFor(due, newPaid);
  return {
    status,
    newPaid,
    data: {
      status,
      paidAmount:     newPaid,
      payAmount:      due,
      paymentDate:    new Date().toISOString(),
      transactionId:  txId,
      transactionIds: FieldValue.arrayUnion(txId),
      updatedAt:      new Date().toISOString(),
      paymentMethod,
      ...(paymentMethod === 'online' && onlineReference ? { onlineReference } : {}),
    },
  };
}

function buildTxData({
  amount, due, isFull, member, closing, entry, closingId, uid,
  programId, programName, paymentMethod, paymentDate, note, onlineReference,
  txNum, batchId, seq, extra = {},
}) {
  return {
    amount,
    paymentMethod,
    paymentDate,
    note:                             note || '',
    status:                           'completed',
    createdAt:                        new Date().toISOString(),
    updatedAt:                        new Date().toISOString(),
    programId,
    programName:                      programName || '',
    payerId:                          member.id,
    payerName:                        member.displayName || '',
    payerFatherName:                  member.fatherName || '',
    payerRegistrationNumber:          member.registrationNumber || '',
    payerPhone:                       member.phone || '',
    payerPhoto:                       member.photoURL || '',
    marriageId:                       closingId,
    closingMemberId:                  closingId,
    closingMemberName:                closing.displayName || entry.paymentFor || '',
    marriageMemberName:               closing.displayName || '',
    closingMemberFatherName:          closing.fatherName || entry.closingFatherName || '',
    closingMemberRegistrationNumber:  closing.registrationNumber || entry.closingRegNo || '',
    marriageRegistrationNumber:       closing.registrationNumber || '',
    closingMemberPhoto:               closing.photoURL || '',
    marriageDate:                     closing.marriage_date || closing.closingAt || entry.closing_date || '',
    paymentPendingId:                 entry.id,
    isFullPayment:                    isFull,
    originalClosingAmount:            due,
    createdBy:                        uid,
    active_flag:                      true,
    delete_flag:                      false,
    transactionType:                  'marriage_payment',
    transactionNumber:                txNum,
    batchId:                          `BATCH-${batchId}`,
    sequenceNumber:                   seq,
    search_keywords:                  createSearchIndex([
      member.displayName, member.registrationNumber,
      closing.displayName, closing.registrationNumber,
      programName, txNum, onlineReference || '',
    ]),
    ...(paymentMethod === 'online' && onlineReference
      ? { onlineReference, onlineVerified: false } : {}),
    ...extra,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export async function POST(request) {
  try {
    const { uid, error: authError } = await verifyToken(request);
    if (authError) return NextResponse.json({ error: authError }, { status: 401 });

    const body = await request.json();

    // Sirf reference number check (UI se)
    if (body._checkOnly) {
      if (!body.programId || !body.onlineReference) return NextResponse.json({ ok: true });
      const dup = await isDuplicateRef(uid, body.programId, body.onlineReference);
      return dup
        ? NextResponse.json({ error: 'Duplicate reference number' }, { status: 409 })
        : NextResponse.json({ ok: true });
    }

    if (body.type === 'single') return await processSinglePayment(uid, body);
    if (body.type === 'bulk')   return await processBulkPayment(uid, body);

    return NextResponse.json({ error: 'Invalid type. Use "single" or "bulk"' }, { status: 400 });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    }
    console.error('[payments/process]', err);
    return NextResponse.json({ error: 'Server error', details: err.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE PAYMENT
//  • Sirf unhi closings ka paisa lega jinki is member ki pending/partial entry hai
//  • Har closing ka due = us entry ka payAmount (member ka current payAmount nahi)
//  • Partial par paidAmount JUDTA hai
//  • Firestore transaction me — double click se duplicate nahi banega
// ═══════════════════════════════════════════════════════════════════════════
async function processSinglePayment(uid, body) {
  const {
    programId, programName,
    payerId, selectedClosingIds,
    paymentMethod, paymentDate, note,
    onlineReference, perClosingAmount, customTotalAmount,
  } = body;

  if (!programId || !payerId || !selectedClosingIds?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const basePath = `users/${uid}/programs/${programId}`;

  if (paymentMethod === 'online' && onlineReference &&
      await isDuplicateRef(uid, programId, onlineReference)) {
    return NextResponse.json({ error: 'Duplicate reference number' }, { status: 409 });
  }

  const uniqueClosingIds = [...new Set(selectedClosingIds)];
  const closingMap = await batchGetDocs(basePath, 'members', uniqueClosingIds);

  const timestamp = Date.now();
  const batchId   = Math.random().toString(36).substr(2, 6).toUpperCase();

  const result = await adminDb.runTransaction(async (t) => {
    // ── READS ──────────────────────────────────────────────────────────────
    const memberSnap = await t.get(adminDb.doc(`${basePath}/members/${payerId}`));
    if (!memberSnap.exists) throw new HttpError(404, 'Member not found');
    const member = { id: memberSnap.id, ...memberSnap.data() };

    const pendSnap = await t.get(
      adminDb.collection(`${basePath}/payment_pending`).where('memberId', '==', payerId)
    );
    const byClosing = mapEntriesByClosing(pendSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

    const fallbackDue = Number(perClosingAmount) || Number(member.payAmount) || 0;
    const targets  = [];
    const rejected = [];

    for (const closingId of uniqueClosingIds) {
      const name  = closingMap[closingId]?.displayName || closingId;
      const entry = byClosing[closingId];
      if (!entry) { rejected.push({ closingId, name, reason: 'no_pending_entry' }); continue; }
      const due      = entryDue(entry, fallbackDue);
      const prevPaid = entryPaid(entry, fallbackDue);
      const remain   = entryRemaining(entry, fallbackDue);
      if (remain <= 0) { rejected.push({ closingId, name, reason: 'already_paid' }); continue; }
      targets.push({ closingId, entry, due, prevPaid, remain });
    }

    if (!targets.length) {
      throw new HttpError(400,
        'चुनी गई क्लोजिंग में इस सदस्य का कोई बकाया नहीं है (एंट्री नहीं है या पहले से पेड है)',
        { rejected });
    }
    if (targets.length > 240) {
      throw new HttpError(400, 'एक बार में अधिकतम 240 क्लोजिंग का भुगतान करें');
    }

    const totalDue    = targets.reduce((s, x) => s + x.remain, 0);
    const custom      = Number(customTotalAmount) || 0;
    const totalAmount = custom > 0 ? custom : totalDue;

    if (totalAmount > totalDue) {
      throw new HttpError(400,
        `राशि ₹${totalAmount} कुल बकाया ₹${totalDue} से ज़्यादा है`,
        { totalDue, rejected });
    }

    // ── WRITES ─────────────────────────────────────────────────────────────
    let remaining = totalAmount;
    let seq = 0;
    let fullyPaid = 0;
    const processed = [];

    for (const x of targets) {
      if (remaining <= 0) break;
      seq++;
      const pay   = Math.min(remaining, x.remain);
      const txRef = adminDb.collection(`${basePath}/transactions`).doc();
      const upd   = buildEntryUpdate({
        entry: x.entry, due: x.due, prevPaid: x.prevPaid, pay,
        txId: txRef.id, paymentMethod, onlineReference,
      });
      const isFull = upd.status === 'paid';
      if (isFull) fullyPaid++;

      t.set(txRef, buildTxData({
        amount: pay, due: x.due, isFull, member,
        closing: closingMap[x.closingId] || {}, entry: x.entry, closingId: x.closingId,
        uid, programId, programName, paymentMethod, paymentDate, note, onlineReference,
        txNum: `TRX-${timestamp}-${batchId}-${String(seq).padStart(3, '0')}`,
        batchId, seq,
      }));
      t.update(adminDb.doc(`${basePath}/payment_pending/${x.entry.id}`), upd.data);

      processed.push({ closingId: x.closingId, amount: pay, status: upd.status });
      remaining -= pay;
    }

    return { processed, fullyPaid, totalPaid: totalAmount - remaining, rejected };
  });

  return NextResponse.json({
    success:   true,
    processed: result.processed.length,
    totalPaid: result.totalPaid,
    fullyPaid: result.fullyPaid,
    remaining: 0,
    rejected:  result.rejected,
    batchId:   `BATCH-${batchId}`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK PAYMENT
// memberClosingSelections = { [memberId]: [pendingDocId, ...] }  -> custom mode
// globalAmount                                                    -> waterfall mode
// Har entry ka due = entry.payAmount - paidAmount (partial bhi shamil)
// ═══════════════════════════════════════════════════════════════════════════
async function processBulkPayment(uid, body) {
  const {
    programId, programName,
    memberIds,
    memberClosingSelections,
    globalAmount,
    paymentMethod, paymentDate, note,
    onlineReference,
  } = body;

  if (!programId || !memberIds?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const isCustomMode = memberClosingSelections && Object.keys(memberClosingSelections).length > 0;

  if (!isCustomMode && !globalAmount) {
    return NextResponse.json({ error: 'Either memberClosingSelections or globalAmount required' }, { status: 400 });
  }

  const basePath     = `users/${uid}/programs/${programId}`;
  const memberChunks = chunkArray(memberIds, 30);

  const dupCheck = paymentMethod === 'online' && onlineReference
    ? await isDuplicateRef(uid, programId, onlineReference)
    : false;
  if (dupCheck) return NextResponse.json({ error: 'Duplicate reference number' }, { status: 409 });

  const memberSnaps = await Promise.all(memberIds.map(id => adminDb.doc(`${basePath}/members/${id}`).get()));
  const members   = memberSnaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  const pendingSnapChunks = await Promise.all(
    memberChunks.map(chunk =>
      adminDb.collection(`${basePath}/payment_pending`).where('memberId', 'in', chunk).get()
    )
  );
  const allPendingDocs = pendingSnapChunks.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })));

  const pendingByMember = {};
  for (const p of allPendingDocs) {
    if (!pendingByMember[p.memberId]) pendingByMember[p.memberId] = [];
    pendingByMember[p.memberId].push(p);
  }

  // entry -> { due, prevPaid, remain }
  const withDue = (p, member) => {
    const fallback = Number(member.payAmount) || 0;
    const due      = entryDue(p, fallback);
    const prevPaid = entryPaid(p, fallback);
    return { entry: p, due, prevPaid, remain: entryRemaining(p, fallback) };
  };

  let memberPayments = [];

  if (isCustomMode) {
    for (const memberId of memberIds) {
      const member = memberMap[memberId];
      if (!member) continue;
      const selectedPendingIds = memberClosingSelections[memberId] || [];
      if (!selectedPendingIds.length) continue;

      const items = (pendingByMember[memberId] || [])
        .filter(p => selectedPendingIds.includes(p.id) && isOpenEntry(p))
        .map(p => withDue(p, member))
        .filter(x => x.remain > 0);

      if (!items.length) continue;
      memberPayments.push({ member, items, amountToPay: items.reduce((s, x) => s + x.remain, 0) });
    }
  } else {
    const sortedMembers = [...members].sort((a, b) =>
      (pendingByMember[b.id]?.length || 0) - (pendingByMember[a.id]?.length || 0)
    );
    let remainingGlobal = Number(globalAmount);

    for (const member of sortedMembers) {
      if (remainingGlobal <= 0) break;
      const items = (pendingByMember[member.id] || [])
        .filter(isOpenEntry)
        .map(p => withDue(p, member))
        .filter(x => x.remain > 0);
      if (!items.length) continue;

      // Poori closing hi bharo (waterfall me aadhi closing nahi)
      const picked = [];
      let amt = 0;
      for (const x of items) {
        if (amt + x.remain > remainingGlobal) break;
        picked.push(x);
        amt += x.remain;
      }
      if (amt > 0) {
        memberPayments.push({ member, items: picked, amountToPay: amt });
        remainingGlobal -= amt;
      }
    }
  }

  if (!memberPayments.length) {
    return NextResponse.json({
      error: 'No valid pending closings found to process',
      debug: {
        mode:         isCustomMode ? 'custom' : 'waterfall',
        membersFound: members.length,
        pendingTotal: allPendingDocs.length,
      },
    }, { status: 400 });
  }

  const closingMemberIds = [
    ...new Set(memberPayments.flatMap(mp =>
      mp.items.map(x => x.entry.closingMemberId || x.entry.marriageId).filter(Boolean)
    )),
  ];
  const closingMemberMap = await batchGetDocs(basePath, 'members', closingMemberIds);

  const timestamp = Date.now();
  const batchId   = Math.random().toString(36).substr(2, 6).toUpperCase();
  const sb        = new SmartBatch(adminDb);
  let globalSeq   = 0;
  let totalProc   = 0;
  let totalPaidAmt = 0;

  for (const { member, items, amountToPay } of memberPayments) {
    let remaining = amountToPay;
    for (const x of items) {
      if (remaining <= 0) break;
      globalSeq++;
      const pay             = Math.min(remaining, x.remain);
      const closingMemberId = x.entry.closingMemberId || x.entry.marriageId;
      const txRef           = adminDb.collection(`${basePath}/transactions`).doc();
      const upd = buildEntryUpdate({
        entry: x.entry, due: x.due, prevPaid: x.prevPaid, pay,
        txId: txRef.id, paymentMethod, onlineReference,
      });

      sb.set(txRef, buildTxData({
        amount: pay, due: x.due, isFull: upd.status === 'paid', member,
        closing: closingMemberMap[closingMemberId] || {}, entry: x.entry, closingId: closingMemberId,
        uid, programId, programName, paymentMethod, paymentDate, note, onlineReference,
        txNum: `TRX-${timestamp}-${batchId}-${String(globalSeq).padStart(3, '0')}`,
        batchId, seq: globalSeq,
        extra: { bulkPaymentMode: isCustomMode ? 'custom_selection' : 'waterfall' },
      }));
      sb.update(adminDb.doc(`${basePath}/payment_pending/${x.entry.id}`), upd.data);

      remaining    -= pay;
      totalPaidAmt += pay;
      totalProc++;
    }
  }

  await sb.commit();

  return NextResponse.json({
    success:           true,
    mode:              isCustomMode ? 'custom_selection' : 'waterfall',
    membersProcessed:  memberPayments.length,
    closingsProcessed: totalProc,
    totalPaid:         totalPaidAmt,
    remaining:         isCustomMode ? 0 : Number(globalAmount) - totalPaidAmt,
    batchId:           `BATCH-${batchId}`,
  });
}
