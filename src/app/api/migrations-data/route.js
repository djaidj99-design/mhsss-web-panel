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
const DATA_DIR = path.join(process.cwd(), "data", "migration");

const FILE_CONFIG = {
  vivah: { file: "vivah.json", label: "Vivah" },
  mamera: { file: "mamera.json", label: "Mamera" },
  surksha: { file: "surksha.json", label: "Suraksha" },
};

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function generate6DigitRegNo() {
  return crypto.randomInt(100000, 999999);
}

function generateMemberPassword(displayName, dobStr) {
  if (!displayName || !dobStr) return "Member@123";
  try {
    const firstName = displayName.trim().split(" ")[0].toLowerCase().slice(0, 5);
    const parts = dobStr.split("-");
    const year = parts.length === 3 ? parts[2] : "";
    if (!firstName || !year || year.length !== 4) return "Member@123";
    return `${firstName}${year}`;
  } catch {
    return "Member@123";
  }
}

function getDecimalAge(birthDate, joinDate) {
  const b = dayjs(birthDate, "DD-MM-YYYY");
  const j = dayjs(joinDate, "DD-MM-YYYY");
  return j.diff(b, "year", true);
}

function cleanPhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+91")) cleaned = cleaned.slice(3);
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("91") && cleaned.length === 12) cleaned = cleaned.slice(2);
  if (cleaned.length === 10 && /^\d{10}$/.test(cleaned)) return cleaned;
  return "";
}

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  if (/year/i.test(trimmed)) return null;
  if (/^#VALUE!|^#REF!|^#N\/A/i.test(trimmed)) return null;
  if (/^0+$/.test(trimmed)) return null;
  let cleaned = trimmed.replace(/\\/g, "/").replace(/\s+/g, "").replace(/["'`]/g, "");
  const formats = ["DD/MM/YYYY", "D/M/YYYY", "DD/M/YYYY", "D/MM/YYYY", "DD-MM-YYYY", "DD/MM/YY", "D/M/YY"];
  for (const fmt of formats) {
    const d = dayjs(cleaned, fmt, true);
    if (d.isValid()) return d.format("DD-MM-YYYY");
  }
  const cleanFlex = cleaned.replace(/[-\/\\]/g, "/");
  if (cleanFlex !== cleaned) {
    const flexFormats = ["DD/MM/YYYY", "DD/M/YYYY", "D/MM/YYYY"];
    for (const fmt of flexFormats) {
      const d = dayjs(cleanFlex, fmt, true);
      if (d.isValid()) return d.format("DD-MM-YYYY");
    }
  }
  const yearPadded = cleaned.replace(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{3})$/, (_, d, m, y) => `${d}-${m}-${y.length === 3 ? "2" + y : y}`);
  if (yearPadded !== cleaned) {
    const d = dayjs(yearPadded, "DD-MM-YYYY", true);
    if (d.isValid()) return d.format("DD-MM-YYYY");
  }
  const padded = cleaned.replace(/^(\d{1,2})[-\/](\d{2})(\d{4})$/, "$1-$2-$3");
  if (padded !== cleaned) {
    const d = dayjs(padded, "DD-MM-YYYY", true);
    if (d.isValid()) return d.format("DD-MM-YYYY");
  }
  const flexible = dayjs(cleaned, "DD/MM/YYYY", false);
  if (flexible.isValid()) return flexible.format("DD-MM-YYYY");
  return null;
}

function toFirestoreTimestamp(dateStr) {
  if (!dateStr) return null;
  const d = dayjs(dateStr, "DD-MM-YYYY");
  if (!d.isValid()) return null;
  return Timestamp.fromDate(d.toDate());
}

function extractAgeFromText(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{1,3})\s*y(?:ea)?r?s?\s*$/i);
  if (match) return parseInt(match[1], 10);
  if (/^\d{1,3}$/.test(trimmed)) return parseInt(trimmed, 10);
  return null;
}

function parseNumericValue(val) {
  if (!val && val !== 0) return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[,₹$]/g, "").trim().toLowerCase();
  if (cleaned === "free" || cleaned === "फ्री" || cleaned === "offer" || cleaned === "0ffer" || cleaned === "0") return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeAgentName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[\s\-\.]+/g, " ").replace(/[^\w\u0900-\u097F\s]/g, "").trim();
}

const AGENT_TRANSLITERATION = {
  "d b": "डी बी",
  "d s": "डी एस",
  "s h": "सुरेश ह",
  "s s modi": "एस एस मोदी",
  "ganpatlal nenava": "गनपत नेनवा",
  "ganpat ji nenava": "गनपत नेनवा",
  "ganpatlal modi nenava": "गनपत नेनवा",
  "dinesh duchakvada": "दिनेश मोदी दुचकवाडा",
  "dinesh modi duchakvada": "दिनेश मोदी दुचकवाडा",
  "narshi ji lakhni": "नर्शिजी लाखनी",
  "sumer ji sindhari": "सुमेरजी सिन्धरी",
  "sumer ji balotra": "सुमेरजी बालोतरा",
  "champaklal adi": "चम्पकलाल",
  "kiran nana meda": "किरण नानामेडा",
  "popatlal modi vasna": "पोपटजी मोदी वासना",
  "shyam treding balotra": "श्याम ट्रेडिंग बालोतरा",
  "reva bhai luvana": "रेवा भाई लुवाना",
  "sivaji modi virar": "शिवाजी मोदी विरार",
  "hitesh ji haripura": "हितेश जी हरीपुरा",
  "mohan ji savrakha": "मोहन जी सावरखा",
  "rohit modi luvana": "रोहित मोदी लुवाना",
  "shiva patel luvana": "शिवा पटेल लुवाना",
  "masra modi bhuriya": "मसरा मोदी भूरिया",
  "parasmal bhati balotra": "परस्मल भाटी बालोतरा",
  "dr javan prjapati": "डॉ जवान प्रजापति",
  "nareshji modi adi": "नरेशजी मोदी अडी",
  "dinesh ji duchakvada": "दिनेश जी दुचकवाडा",
};

function findMatchingAgent(normalizedName, agents) {
  if (!normalizedName || !agents?.length) return null;
  const norm = (s) => normalizeAgentName(s);
  const exact = agents.find((a) => norm(a.displayName) === normalizedName);
  if (exact) return exact;
  const partial = agents.find((a) => {
    const aName = norm(a.displayName);
    return aName.includes(normalizedName) || normalizedName.includes(aName);
  });
  if (partial) return partial;
  const hindi = AGENT_TRANSLITERATION[normalizedName];
  if (hindi) {
    const hNorm = norm(hindi);
    const m = agents.find((a) => norm(a.displayName) === hNorm);
    if (m) return m;
    const mp = agents.find((a) => {
      const aName = norm(a.displayName);
      return aName.includes(hNorm) || hNorm.includes(aName);
    });
    if (mp) return mp;
  }
  return null;
}

const COMMON_FIELDS = {
  vivah: { fatherKey: "Father Name", scheme: "Marriege Relief" },
  mamera: { fatherKey: "Father Name", scheme: "Bhai-Bahin MAYRA" },
  surksha: { fatherKey: "Father / Hus ", scheme: "Suraksha" },
};

function mapRow(row, fileKey) {
  const cfg = COMMON_FIELDS[fileKey];
  const name = (row.Name || "").trim();
  const phone = cleanPhone(row["Mobile No."]);
  const bobDate = parseDate(row["D.O.B"]);
  const dateJoin = parseDate(row["Registration Date"]);
  const fatherName = (row[cfg.fatherKey] || "").trim();
  const agentRaw = (row.Agent || "").trim();
  const ageFromText = extractAgeFromText(row["D.O.B"]);
  return {
    displayName: name,
    fatherName,
    phone,
    bobDate,
    dateJoin,
    agentRaw,
    ageFromText,
    aadhaarNo: (row["Aadhar Number"] || "").replace(/[\s-]/g, ""),
    gotra: (row.Gotra || "").trim(),
    village: (row.Gram || "").trim(),
    city: (row.Tehsil || "").trim(),
    district: (row.District || "").trim(),
    state: (row.Sate || "").trim(),
    registrationAmount: parseNumericValue(row["Registration Amount"]),
    premium: parseNumericValue(row.Premium),
    scheme: cfg.scheme,
  };
}

async function getProgramData(userId, programId) {
  const snap = await db.collection("users").doc(userId).collection("programs").doc(programId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function getAgents(userId) {
  const snap = await db.collection("users").doc(userId).collection("agents").get();
  const agents = [];
  snap.forEach((d) => agents.push({ id: d.id, ...d.data() }));
  return agents;
}

export async function GET() {
  try {
    const preview = {};
    for (const [key, cfg] of Object.entries(FILE_CONFIG)) {
      const rows = loadJson(path.join(DATA_DIR, cfg.file));
      const mapped = rows.map((r, i) => {
        const m = mapRow(r, key);
        return {
          index: i,
          ...m,
          rawDob: r["D.O.B"],
          rawJoinDate: r["Registration Date"],
          memberNo: r["Member No."],
          missingName: !m.displayName,
          missingPhone: !m.phone,
          missingJoinDate: !m.dateJoin,
          missingDob: !m.bobDate && !m.ageFromText,
        };
      });
      const valid = mapped.filter((m) => m.displayName && m.phone && m.dateJoin && (m.bobDate || m.ageFromText));
      const invalid = mapped.filter((m) => !m.displayName || !m.phone || !m.dateJoin || (!m.bobDate && !m.ageFromText));
      preview[key] = {
        total: rows.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        uniqueAgents: [...new Set(mapped.filter((m) => m.agentRaw).map((m) => m.agentRaw))],
        sample: mapped.slice(0, 3),
        invalidSamples: invalid.slice(0, 10),
      };
    }
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, programId, files = ["vivah", "mamera", "surksha"], applicationNumberConfig } = body;
    if (!userId || !programId) {
      return NextResponse.json({ success: false, message: "userId and programId required" }, { status: 400 });
    }
    const program = await getProgramData(userId, programId);
    if (!program) {
      return NextResponse.json({ success: false, message: "Program not found" }, { status: 404 });
    }
    if (!program.ageGroups?.length) {
      return NextResponse.json({ success: false, message: "Program has no age groups defined" }, { status: 400 });
    }

    const agents = await getAgents(userId);
    const counters = { total: 0, memberCount: program.memberCount || 0 };
    const results = {};
    const memberCollectionPath = `users/${userId}/programs/${programId}/members`;
    const programRef = db.collection("users").doc(userId).collection("programs").doc(programId);

    let nextAppNo = null;
    const usedAppNos = new Set();
    if (applicationNumberConfig?.enabled) {
      nextAppNo = applicationNumberConfig.startFrom || 1001;
    }

    for (const fileKey of files) {
      const cfg = FILE_CONFIG[fileKey];
      if (!cfg) continue;
      const rows = loadJson(path.join(DATA_DIR, cfg.file));
      const tableResult = { success: 0, skipped: 0, errors: 0, details: [] };

      console.log(`\n--- Starting ${fileKey} (${rows.length} rows) ---`);
      let fileProgress = 0;

      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          const md = mapRow(row, fileKey);

          if (!md.displayName) { tableResult.skipped++; tableResult.details.push({ index: i, memberNo: row["Member No."], status: "skipped", reason: "missing name" }); continue; }
          if (!md.phone) { tableResult.skipped++; tableResult.details.push({ index: i, memberNo: row["Member No."], name: md.displayName, status: "skipped", reason: "missing phone" }); continue; }
          if (!md.dateJoin) { tableResult.skipped++; tableResult.details.push({ index: i, memberNo: row["Member No."], name: md.displayName, status: "skipped", reason: "missing/invalid join date" }); continue; }
          if (!md.bobDate && !md.ageFromText) { tableResult.skipped++; tableResult.details.push({ index: i, memberNo: row["Member No."], name: md.displayName, status: "skipped", reason: "missing/invalid dob" }); continue; }

          counters.total++;
          fileProgress++;
          const regNo = "R" + generate6DigitRegNo();
          const memberNumber = ++counters.memberCount;
          const effectiveBobDate = md.bobDate || md.dateJoin;
          const decimalAge = getDecimalAge(effectiveBobDate, md.dateJoin);
          const matchedAgeGroup = program.ageGroups.find((g) => decimalAge >= g.startAge && decimalAge < g.endAge);
          const village = md.village || "";
          const matchedLocationGroup = program.locationGroups?.find((g) => g.location === village);
          const defaultLocation = program.locationGroups?.[0] || null;

          const normalizedAgent = normalizeAgentName(md.agentRaw);
          const matchedAgent = findMatchingAgent(normalizedAgent, agents);

          const password = generateMemberPassword(md.displayName, effectiveBobDate);
          const now = admin.firestore.FieldValue.serverTimestamp();
          const regDateTimestamp = toFirestoreTimestamp(md.dateJoin);

          let appNo = "";
          if (nextAppNo !== null) {
            while (usedAppNos.has(nextAppNo)) nextAppNo++;
            appNo = String(nextAppNo);
            usedAppNos.add(nextAppNo);
            nextAppNo++;
          }

          const docData = {
            displayName: md.displayName,
            fatherName: md.fatherName,
            motherName: "",
            phone: md.phone,
            phoneAlt: "",
            aadhaarNo: md.aadhaarNo,
            gotra: md.gotra,
            jati: "",
            address: "",
            pinCode: "",
            village: md.village,
            city: md.city,
            district: md.district,
            state: md.state.replace(/^[ ]+|[ ]+$/g, ""),
            gender: "",
            bobDate: effectiveBobDate,
            dateJoin: md.dateJoin,
            age: Math.floor(decimalAge),
            cast: "",
            kistAmount: md.premium,
            applicationNumber: appNo,
            guardian: "",
            guardianRelation: "",
            guardianAadharNo: "",
            ageGroup: matchedAgeGroup?.id || "",
            ageGroupRange: matchedAgeGroup ? `${matchedAgeGroup.startAge}-${matchedAgeGroup.endAge}` : "",
            payAmount: matchedAgeGroup?.payAmount || 0,
            joinFees: matchedAgeGroup?.joinFee || 0,
            memberGroup: (matchedLocationGroup || defaultLocation)?.groupName || "Group_A",
            locationGroup: (matchedLocationGroup || defaultLocation)?.location || village,
            locactionGroupId: (matchedLocationGroup || defaultLocation)?.id || "",
            registrationNumber: regNo,
            memberNumber,
            programId,
            programName: program.name,
            agentId: matchedAgent?.id || null,
            agentName: matchedAgent?.displayName || md.agentRaw || null,
            joinFeesDone: false,
            joinFeesPaidAmount: 0,
            joinFeesRemainingAmount: matchedAgeGroup?.joinFee || 0,
            role: "member",
            addedBy: matchedAgent ? "agent" : "admin",
            addedByName: matchedAgent?.displayName || md.agentRaw || "Admin",
            isBlocked: false,
            closingMonths: 0,
            membershipClosingDate: null,
            extraDetails: [],
            marriage_flag: false,
            status: "accepted",
            active_flag: true,
            delete_flag: false,
            account_flag: false,
            migratedFrom: `data_${fileKey}`,
            oldRecordIndex: i,
            createdAt: regDateTimestamp || now,
            updatedAt: now,
          };

          const memberRef = db.collection(memberCollectionPath).doc();
          const memberId = memberRef.id;
          docData.uid = memberId;
          await memberRef.set(docData);
          console.log(`  ${fileKey} [${fileProgress}/${rows.length}] ${md.displayName} -> ${memberId}${appNo ? ` appNo:${appNo}` : ""}`);
          await programRef.update({ memberCount: admin.firestore.FieldValue.increment(1) });

          try {
            const email = `${regNo}@gmail.com`;
            await auth.createUser({
              uid: memberId, email, emailVerified: true,
              displayName: docData.displayName, password,
            });
            await auth.setCustomUserClaims(memberId, {
              role: "member", programId, createdBy: userId,
              displayName: docData.displayName, email,
            });
            await memberRef.update({ account_flag: true, password });
          } catch (authErr) {
            if (authErr.code !== "auth/uid-already-exists") {
              tableResult.details.push({ index: i, status: "auth_failed", error: authErr.message });
            }
          }

          tableResult.success++;
          tableResult.details.push({ index: i, memberId, regNo, appNo: docData.applicationNumber || "", name: md.displayName, agentName: docData.agentName || "none", status: "migrated" });
        } catch (err) {
          tableResult.errors++;
          tableResult.details.push({ index: i, status: "error", error: err.message });
        }
      }
      results[fileKey] = tableResult;
      console.log(`--- ${fileKey} done: ${tableResult.success} migrated, ${tableResult.skipped} skipped, ${tableResult.errors} errors ---`);
    }

    const totalMigrated = Object.values(results).reduce((s, r) => s + r.success, 0);
    const totalSkipped = Object.values(results).reduce((s, r) => s + r.skipped, 0);
    const totalErrors = Object.values(results).reduce((s, r) => s + r.errors, 0);
    console.log(`\n=== Migration complete ===`);
    console.log(`Total migrated: ${totalMigrated}`);
    console.log(`Total skipped:  ${totalSkipped}`);
    console.log(`Total errors:   ${totalErrors}`);
    console.log(`Member count:   ${counters.memberCount}`);

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: counters.total,
        totalMigrated,
        totalSkipped,
        totalErrors,
        finalMemberCount: counters.memberCount,
      },
      tables: results,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json();
    const { userId, programId } = body;
    if (!userId || !programId) {
      return NextResponse.json({ success: false, message: "userId and programId required" }, { status: 400 });
    }
    const coll = `users/${userId}/programs/${programId}/members`;
    const snap = await db.collection(coll).where("migratedFrom", "in", ["data_vivah", "data_mamera", "data_surksha"]).get();
    let deleted = 0, authDeleted = 0, errors = [];
    for (const doc of snap.docs) {
      try {
        const d = doc.data();
        if (d.account_flag) {
          try { await auth.deleteUser(doc.id); authDeleted++; } catch (e) { if (e.code !== "auth/user-not-found") errors.push({ uid: doc.id, error: e.message }); }
        }
        await doc.ref.delete();
        deleted++;
      } catch (e) { errors.push({ uid: doc.id, error: e.message }); }
    }
    await db.collection("users").doc(userId).collection("programs").doc(programId)
      .update({ memberCount: admin.firestore.FieldValue.increment(-deleted) });
    return NextResponse.json({ success: true, deletedCount: deleted, authDeletedCount: authDeleted, errors: errors.length ? errors : undefined });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
