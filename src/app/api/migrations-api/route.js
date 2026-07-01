import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import admin from "../admin";
import { Timestamp } from "firebase-admin/firestore";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(customParseFormat);

export const runtime = "nodejs";

const db = admin.firestore();
const auth = admin.auth();
const MIGRATION_DIR = path.join(process.cwd(), "data", "migration");

// ─── Parse PHPMyAdmin JSON format ──────────────────────────────────────────
function parsePhpMyAdminJson(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const tableEntry = raw.find((entry) => entry.type === "table");
  return tableEntry?.data || [];
}

// ─── Load reference data ───────────────────────────────────────────────────
function loadReferences() {
  const states = {}, dists = {}, cities = {}, casts = {};
  for (const row of parsePhpMyAdminJson(path.join(MIGRATION_DIR, "states.json"))) states[row.id] = row.name;
  for (const row of parsePhpMyAdminJson(path.join(MIGRATION_DIR, "districs.json"))) dists[row.id] = { name: row.name, stateId: row.state_id };
  for (const row of parsePhpMyAdminJson(path.join(MIGRATION_DIR, "cities.json"))) cities[row.id] = { name: row.name, stateId: row.state_id, distId: row.distric_id };
  for (const row of parsePhpMyAdminJson(path.join(MIGRATION_DIR, "casts.json"))) casts[row.id] = row.name;
  return { states, dists, cities, casts };
}

// ─── Generate 6-digit reg number ───────────────────────────────────────────
function generate6DigitRegNo() {
  return crypto.randomInt(100000, 999999);
}

// ─── Convert YYYY-MM-DD → DD-MM-YYYY ───────────────────────────────────────
function toDDMMYYYY(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.split(" ")[0].split("-");
  if (parts.length !== 3) return dateStr;
  // If already DD-MM-YYYY, return as-is
  if (parseInt(parts[0]) > 31) {
    // YYYY-MM-DD → DD-MM-YYYY
    const [y, m, d] = parts;
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }
  return dateStr;
}

// ─── Calculate decimal age (same as AddMember) ─────────────────────────────
function getDecimalAge(birthDate, joinDate) {
  const b = dayjs(birthDate, "DD-MM-YYYY");
  const j = dayjs(joinDate, "DD-MM-YYYY");
  return j.diff(b, "year", true);
}

// ─── Generate member password (same as commonFun.js) ───────────────────────
function generateMemberPassword(displayName, dobStr) {
  if (!displayName || !dobStr) return "Member@123";
  try {
    const firstName = displayName.trim().split(" ")[0].toLowerCase().slice(0, 5);
    // dobStr is DD-MM-YYYY → year is parts[2]
    const parts = dobStr.split("-");
    const year = parts.length === 3 ? parts[2] : "";
    if (!firstName || !year || year.length !== 4) return "Member@123";
    return `${firstName}${year}`;
  } catch {
    return "Member@123";
  }
}

// ─── Convert old SQL datetime string to Firebase Timestamp ─────────────────
function toFirestoreTimestamp(sqlDatetime) {
  if (!sqlDatetime) return null;
  // Format: "2025-04-14 14:22:43"
  const d = dayjs(sqlDatetime, "YYYY-MM-DD HH:mm:ss");
  if (!d.isValid()) return null;
  return Timestamp.fromDate(d.toDate());
}

// ─── Map old member row to new Firestore document ──────────────────────────
function mapMemberData(row, refs, tableName) {
  const gender = row.gender === "2" ? "female" : row.gender === "1" ? "male" : "";
  const city = refs.cities[row.city_id];
  const dist = refs.dists[row.distric_id];
  const state = refs.states[row.state_id];

  const displayName = `${(row.first_name || "").trim()} ${(row.last_name || "").trim()}`.trim();
  const bobDate = toDDMMYYYY(row.dob);           // YYYY-MM-DD → DD-MM-YYYY
  const dateJoin = toDDMMYYYY(row.join_date);    // YYYY-MM-DD → DD-MM-YYYY
  const marriageDate = toDDMMYYYY(row.shadi_date);

  // ── Age calculation ──
  const decimalAge = bobDate && dateJoin ? getDecimalAge(bobDate, dateJoin) : null;
  const age = decimalAge !== null ? Math.floor(decimalAge) : null;

  return {
    displayName,
    fatherName: (row.father_name || "").trim(),
    motherName: (row.mother_name || "").trim(),
    phone: row.mobile_number || "",
    phoneAlt: "",
    aadhaarNo: row.aadhar_no ? row.aadhar_no.replace(/-/g, "") : "",
    gotra: (row.gotra || "").trim(),
    jati: "GHANCHI",
    address: (row.address || "").trim(),
    pinCode: "",
    village: city?.name || "",
    city: city?.name || "",
    district: dist?.name || "",
    state: state || "",
    gender,
    bobDate,
    dateJoin,
    age,
    cast: refs.casts[row.cast_id] || "",
    kistAmount: parseFloat(row.kist_amount) || 0,
    applicationNumber: row.application_number || "",
    oldAgentId: row.agent_id || "",

    // Guardian / varisdar fields
    guardian: (row.varisdar || "").trim(),
    guardianRelation: (row.relation_type || "").trim(),
    guardianAadharNo: row.varisdar_aadhar_no ? row.varisdar_aadhar_no.replace(/-/g, "") : "",

    // Marriage / payment fields
    marriageDate,
    marriageAmount: parseFloat(row.shadi_amount) || 0,
    marriageDetails: row.shadi_details || "",
    receiptNumber: row.receipt_number || "",
    officeRecNo: row.officeRecNo || "",
    shadiPendingAmount: row.shadi_pending_amount ? parseFloat(row.shadi_pending_amount) : null,
    shadiReceiveAmount: row.shadi_receive_amount ? parseFloat(row.shadi_receive_amount) : null,
    shadiCompletedStatus: row.shadi_completed_receive_payment_status === "1",

    // Preserve original timestamps from old system
    originalCreatedAt: toFirestoreTimestamp(row.created_at),
    originalUpdatedAt: toFirestoreTimestamp(row.updated_at),

    // Status flags
    status: "accepted",
    active_flag: true,
    delete_flag: false,
    account_flag: false,
    migratedFrom: tableName,
    oldRecordId: row.id,
  };
}

// ─── GET: Preview migration data ───────────────────────────────────────────
export async function GET() {
  try {
    const refs = loadReferences();
    const preview = {};
    for (const table of ["deaths", "mayaras", "vivahs"]) {
      const rows = parsePhpMyAdminJson(path.join(MIGRATION_DIR, `${table}.json`));
      preview[table] = {
        count: rows.length,
        sample: rows.slice(0, 2).map((r) => mapMemberData(r, refs, table)),
      };
    }
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─── Migrate one table ─────────────────────────────────────────────────────
async function migrateTable(tableName, rows, refs, programDoc, userId, programId, counters, agentMap) {
  const results = { success: 0, skipped: 0, errors: 0, details: [] };
  const memberCollectionPath = `users/${userId}/programs/${programId}/members`;
  const programRef = db.collection("users").doc(userId).collection("programs").doc(programId);
  const ageGroups = programDoc.ageGroups || [];
  const locationGroups = programDoc.locationGroups || [];
  console.log(`[${tableName}] 🚀 Starting migration of ${rows.length} rows...`);

  for (const row of rows) {
    try {
      const memberData = mapMemberData(row, refs, tableName);
      if (!memberData.displayName && !memberData.fatherName) {
        results.skipped++;
        results.details.push({ id: row.id, status: "skipped", reason: "missing name" });
        console.log(`[${tableName}] ⏭️  Skipped id=${row.id}: missing name`);
        continue;
      }
      if (!memberData.bobDate) {
        results.skipped++;
        results.details.push({ id: row.id, status: "skipped", reason: "missing dob" });
        console.log(`[${tableName}] ⏭️  Skipped id=${row.id}: missing dob`);
        continue;
      }

      counters.total++;

      // ── Registration number ──
      const regNo = "R" + generate6DigitRegNo();
      const memberNumber = counters.memberCount + 1;
      counters.memberCount = memberNumber;

      // ── Age group matching ──
      const decimalAge = getDecimalAge(memberData.bobDate, memberData.dateJoin || memberData.bobDate);
      const matchingAgeGroup = ageGroups.find(
        (g) => decimalAge >= g.startAge && decimalAge < g.endAge
      );

      const memberGroupData = {
        ageGroup: matchingAgeGroup?.id || "",
        ageGroupRange: matchingAgeGroup ? `${matchingAgeGroup.startAge}-${matchingAgeGroup.endAge}` : "",
        payAmount: parseFloat(memberData.kist_amount) || matchingAgeGroup?.payAmount || 0,
        joinFees: matchingAgeGroup?.joinFee || 0,
      };

      // ── Location group matching (auto assign by village) ──
      const village = memberData.village || memberData.city || "";
      const firstGroup = locationGroups.length > 0 ? locationGroups[0] : null;
      const matchingLocationGroup = locationGroups.find(
        (g) => g.location === village
      );

      const defaultGroup = matchingLocationGroup || firstGroup;
      const locationGroupData = {
        memberGroup: defaultGroup?.groupName || "Group_A",
        locationGroup: defaultGroup?.location || village,
        locactionGroupId: defaultGroup?.id || "",
      };

      // ── Agent lookup by old agent ID ──
      let agentId = null;
      let agentName = null;
      if (memberData.oldAgentId && agentMap[memberData.oldAgentId]) {
        agentId = agentMap[memberData.oldAgentId].uid;
        agentName = agentMap[memberData.oldAgentId].displayName;
      }

      // ── Password ──
      const password = generateMemberPassword(memberData.displayName, memberData.bobDate);

      // ── Build final doc ──
      const now = admin.firestore.FieldValue.serverTimestamp();
      const docData = {
        ...memberData,
        ...memberGroupData,
        ...locationGroupData,
        registrationNumber: regNo,
        memberNumber,
        programId,
        programName: programDoc.name || "",
        agentId,
        agentName,
        joinFeesDone: false,
        joinFeesPaidAmount: 0,
        joinFeesRemainingAmount: memberGroupData.joinFees || 0,
        role: "member",
        addedBy: agentId ? "agent" : "admin",
        addedByName: agentName || "Admin",
        isBlocked: false,
        closingMonths: 0,
        membershipClosingDate: null,
        extraDetails: [],
        marriage_flag: false,
        createdAt: memberData.originalCreatedAt || now,
        updatedAt: now,
      };

      // ── Create Firestore member doc ──
      const memberRef = db.collection(memberCollectionPath).doc();
      const memberId = memberRef.id;
      docData.uid = memberId;
      await memberRef.set(docData);
      console.log(`[${tableName}] ✅ Member added: ${docData.displayName} (${regNo})`);

      // ── Update program memberCount ──
      await programRef.update({
        memberCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      });

      // ── Create Firebase Auth account ──
      try {
        const email = `${regNo}@gmail.com`;
        await auth.createUser({
          uid: memberId,
          email,
          emailVerified: true,
          displayName: docData.displayName,
          password,
        });
        await auth.setCustomUserClaims(memberId, {
          role: "member",
          programId,
          createdBy: userId,
          displayName: docData.displayName,
          email,
        });
        await memberRef.update({ account_flag: true, password });
        console.log(`[${tableName}] 🔐 Account created: ${email}`);
      } catch (authErr) {
        if (authErr.code !== "auth/uid-already-exists") {
          results.details.push({ id: row.id, status: "auth_failed", error: authErr.message });
        }
      }

      results.success++;
      results.details.push({
        id: row.id,
        memberId,
        regNo,
        ageGroup: matchingAgeGroup ? `${matchingAgeGroup.startAge}-${matchingAgeGroup.endAge}` : "none",
        locationGroup: matchingLocationGroup?.groupName || "auto",
        status: "migrated",
      });
    } catch (err) {
      results.errors++;
      results.details.push({ id: row.id, status: "error", error: err.message });
      console.log(`[${tableName}] ❌ Error id=${row.id}: ${err.message}`);
    }
  }

  console.log(`[${tableName}] 📊 Done — ${results.success} migrated, ${results.skipped} skipped, ${results.errors} errors`);
  return results;
}

// ─── POST: Execute migration ────────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, programId, tables = ["deaths", "mayaras", "vivahs"] } = body;

    if (!userId || !programId) {
      return NextResponse.json(
        { success: false, message: "userId and programId required" },
        { status: 400 }
      );
    }

    const programSnap = await db
      .collection("users")
      .doc(userId)
      .collection("programs")
      .doc(programId)
      .get();
    if (!programSnap.exists) {
      return NextResponse.json({ success: false, message: "Program not found" }, { status: 404 });
    }
    const programDoc = programSnap.data();

    if (!programDoc.ageGroups || programDoc.ageGroups.length === 0) {
      return NextResponse.json(
        { success: false, message: "Program has no age groups defined. Please add age groups first." },
        { status: 400 }
      );
    }

    const refs = loadReferences();

    // ── Build agent lookup map (oldAgentId → agent uid/name) ──
    const agentSnap = await db
      .collection("users")
      .doc(userId)
      .collection("agents")
      .get();
    const agentMap = {};
    for (const agentDoc of agentSnap.docs) {
      const agent = agentDoc.data();
      const oldId = agent.oldAgentId || agent.agentCode || "";
      if (oldId) {
        agentMap[String(oldId)] = { uid: agentDoc.id, displayName: agent.displayName };
      }
    }

    const counters = { total: 0, memberCount: programDoc.memberCount || 0 };
    const results = {};

    for (const table of tables) {
      if (!["deaths", "mayaras", "vivahs"].includes(table)) continue;
      const rows = parsePhpMyAdminJson(path.join(MIGRATION_DIR, `${table}.json`));
      results[table] = await migrateTable(table, rows, refs, programDoc, userId, programId, counters, agentMap);
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: counters.total,
        totalMigrated: Object.values(results).reduce((s, r) => s + r.success, 0),
        totalSkipped: Object.values(results).reduce((s, r) => s + r.skipped, 0),
        totalErrors: Object.values(results).reduce((s, r) => s + r.errors, 0),
        finalMemberCount: counters.memberCount,
      },
      tables: results,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─── DELETE: Revert migration — delete all migrated members + auth accounts ──
export async function DELETE(req) {
  try {
    const body = await req.json();
    const { userId, programId } = body;

    if (!userId || !programId) {
      return NextResponse.json(
        { success: false, message: "userId and programId required" },
        { status: 400 }
      );
    }

    const memberCollectionPath = `users/${userId}/programs/${programId}/members`;
    const memberSnap = await db.collection(memberCollectionPath)
      .where("migratedFrom", "in", ["deaths", "mayaras", "vivahs"])
      .get();

    let deletedCount = 0;
    let authDeletedCount = 0;
    const errors = [];

    for (const doc of memberSnap.docs) {
      try {
        const data = doc.data();
        if (data.account_flag) {
          try {
            await auth.deleteUser(doc.id);
            authDeletedCount++;
          } catch (authErr) {
            if (authErr.code !== "auth/user-not-found") {
              errors.push({ uid: doc.id, error: authErr.message });
            }
          }
        }
        await doc.ref.delete();
        deletedCount++;
        console.log(`[REVERT] 🗑️  Deleted member: ${data.displayName || doc.id} (${data.registrationNumber || "no reg"})`);
      } catch (docErr) {
        errors.push({ uid: doc.id, error: docErr.message });
      }
    }

    const programRef = db.collection("users").doc(userId).collection("programs").doc(programId);
    await programRef.update({ memberCount: 0 });

    console.log(`[REVERT] 📊 Done — ${deletedCount} members deleted, ${authDeletedCount} auth accounts deleted`);

    return NextResponse.json({
      success: true,
      deletedCount,
      authDeletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
