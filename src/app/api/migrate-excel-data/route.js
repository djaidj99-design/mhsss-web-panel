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
const DATA_DIR = path.join(process.cwd(), "src", "app", "api", "migrationData");

const HINDI_MONTHS = {
  "जन॰": "01", "फर॰": "02", "मार्च": "03", "अप्रैल": "04",
  "अप्र॰": "04", "मई": "05", "जून": "06", "जुला॰": "07",
  "जुल॰": "07", "अग॰": "08", "सित॰": "09", "अक्टू॰": "10",
  "नव॰": "11", "दिस॰": "12",
};

const DISTRICT_NORMALIZE = {
  "jailsalmer": "jaisalmer",
  "balotra": "balotra",
  "jalor": "jalore",
  "jalore": "jalore",
  "barmer": "barmer",
  "jodhpur": "jodhpur",
  "pali": "pali",
  "banaskantha": "banaskantha",
  "valsad": "valsad",
  "ahmedabad": "ahmedabad",
  "siwana": "balotra",
  "kota": "kota",
  "sirohi": "sirohi",
  "south goa": "south-goa",
  "krishna": "krishna",
  "didwana kuchaman": "didwana-kuchaman",
  "sanchore": "sanchore",
};

const STATE_NORMALIZE = {
  "rajasthan": "Rajasthan",
  "gujarat": "Gujarat",
  "goa": "Goa",
  "andhra pradesh": "Andhra Pradesh",
  "maharashtra": "Maharashtra",
};

const COMMON_FIELDS = {
  mayra: { label: "Mayra Yojna", scheme: "Bhai-Bahin MAYRA" },
  vivah: { label: "Vivah Yojna", scheme: "Marriege Relief" },
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

  // Try Hindi month format: "21-जन॰-26"
  const hindiMatch = trimmed.match(/^(\d{1,2})\s*-\s*([\u0900-\u097F]{3,5}\.?)\s*-\s*(\d{2,4})$/);
  if (hindiMatch) {
    const [, day, hindiMonth, year] = hindiMatch;
    const monthNum = HINDI_MONTHS[hindiMonth];
    if (monthNum) {
      let fullYear = year;
      if (year.length === 2) {
        fullYear = parseInt(year) > 25 ? "19" + year : "20" + year;
      }
      const formatted = `${day.padStart(2, "0")}-${monthNum}-${fullYear}`;
      const d = dayjs(formatted, "DD-MM-YYYY");
      if (d.isValid()) return formatted;
    }
  }

  let cleaned = trimmed.replace(/\\/g, "/").replace(/\s+/g, "").replace(/["'`]/g, "");

  // Detect date format from numeric parts
  const parts = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const secondIsDay = parts && parseInt(parts[2]) > 12; // M/D/YYYY (e.g. "4/30/2006")
  const firstIsDay = parts && parseInt(parts[1]) > 12;  // D/M/YYYY (e.g. "30/4/2006")

  // Files are Excel-converted using M/D/YYYY. Try M/D first, fall back to D/M.
  if (!firstIsDay) {
    const mdFormats = ["MM/DD/YYYY", "M/D/YYYY", "MM/D/YYYY", "M/DD/YYYY"];
    for (const fmt of mdFormats) {
      const d = dayjs(cleaned, fmt, true);
      if (d.isValid()) return d.format("DD-MM-YYYY");
    }
  }

  // Try standard D/M formats (including unambiguous D/M where first part > 12)
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

function parseNumericValue(val) {
  if (!val && val !== 0) return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[,₹$]/g, "").trim().toLowerCase();
  if (cleaned === "free" || cleaned === "फ्री" || cleaned === "offer" || cleaned === "0ffer" || cleaned === "0") return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeDistrict(district) {
  if (!district) return "";
  const key = district.trim().toLowerCase();
  return DISTRICT_NORMALIZE[key] || key;
}

function normalizeState(state) {
  if (!state) return "";
  const trimmed = state.trim().replace(/\n/g, " ");
  const key = trimmed.toLowerCase();
  return STATE_NORMALIZE[key] || trimmed;
}

function mapGender(sex) {
  if (!sex) return "";
  const s = sex.trim().toUpperCase();
  if (s === "M" || s === "पुरुष" || s === "male") return "male";
  if (s === "F" || s === "महिला" || s === "female") return "female";
  return "";
}

function cleanAadhaar(val) {
  if (!val || typeof val !== "string") return "";
  const digits = val.replace(/[^\d]/g, "");
  if (digits.length === 12) return digits;
  return "";
}

function normalizeAgentName(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[\s\-\.]+/g, " ").replace(/\n/g, " ").replace(/[^\w\u0900-\u097F\s]/g, "").trim();
}

function mapRow(row, fileKey) {
  const cfg = COMMON_FIELDS[fileKey];
  const name = (row.Name || "").trim().replace(/\n/g, " ");
  const phone = cleanPhone(row["Mobil no"]);
  const bobDate = parseDate(row.Dob);
  const dateJoin = parseDate(row["Joning Date"]);
  const fatherName = (row["Father Name"] || "").trim().replace(/\n/g, " ");
  const agentRaw = (row.Agent || "").trim().replace(/\n/g, " ");
  return {
    displayName: name,
    fatherName,
    phone,
    bobDate,
    dateJoin,
    agentRaw,
    aadhaarNo: cleanAadhaar(row["Aadhar Card member"]),
    gotra: (row.Gotra || "").trim(),
    caste: (row.Caste || "").trim(),
    nominee: (row.Nominee || "").trim().replace(/\n/g, " "),
    nomineeRelation: (row.Relation || "").trim(),
    nomineeAadhar: cleanAadhaar(row["Aadhar Card Nominee"]),
    address: (row.Address || "").trim(),
    cityVillage: (row["City/village"] || "").trim(),
    district: normalizeDistrict(row.District),
    state: normalizeState(row.State),
    gender: mapGender(row.sex),
    joiningFee: parseNumericValue(row["Jonining Fee"]),
    givenJoiningFee: parseNumericValue(row["Given Joining Fee"]),
    pendingJoiningFee: parseNumericValue(row["Pending Joning fee"]),
    emiPerEvent: parseNumericValue(row["Emi per event"]),
    scheme: cfg.scheme,
    oldMemberId: row["Member Id"],
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

const AGENT_TRANSLITERATION = {
  "kantilal": "कांतिलाल",
  "parasmalji": "परस्मल जी",
  "parasmal": "परस्मल जी",
  "ukaramji": "उकाराम जी",
  "sumerji parihar": "सुमेरजी सिन्धरी",
  "sumerji\nparihar": "सुमेरजी सिन्धरी",
  "sumerji parihar": "सुमेरजी सिन्धरी",
  "mahendra": "महेंद्र",
  "m.j.": "एम.जे.",
  "mj": "एम.जे.",
  "self": "सेल्फ",
  "hanuman ji": "हनुमान जी",
  "hanumanji": "हनुमान जी",
  "raju ji": "राजू जी",
  "rajuji": "राजू जी",
  "amrit": "अमृत",
  "amrat lal": "अमृत लाल",
  "amratlal": "अमृत लाल",
  "suresh rathore": "सुरेश राठौड़",
  "suresh": "सुरेश",
  "bharat": "भारत",
  "champalal ji": "चम्पकलाल",
  "chaina ram": "चैना राम",
  "chainaram": "चैना राम",
  "bhawarji": "भंवर जी",
  "siremal": "सिरेमाल",
  "ganpat singh": "गणपत सिंह",
  "gordhan ji": "गोर्धन जी",
  "ukaram ji": "उकाराम जी",
};

function findMatchingAgent(normalizedName, agents) {
  if (!normalizedName || !agents?.length) return null;
  const norm = (s) => normalizeAgentName(s);
  if (!normalizedName) return null;
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

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const programId = searchParams.get("programId");
    let program = null;
    if (userId && programId) {
      program = await getProgramData(userId, programId);
    }

    const preview = {};
    for (const [key, cfg] of Object.entries(COMMON_FIELDS)) {
      const rows = loadJson(path.join(DATA_DIR, `${key}.json`));
      const mapped = rows.map((r, i) => {
        const m = mapRow(r, key);
        return {
          index: i,
          ...m,
          rawDob: r.Dob,
          rawJoinDate: r["Joning Date"],
          rawPhone: r["Mobil no"],
          oldMemberId: r["Member Id"],
          missingName: !m.displayName,
          missingPhone: !m.phone,
          missingJoinDate: !m.dateJoin,
          missingDob: !m.bobDate,
        };
      });
      let valid = mapped.filter((m) => m.displayName && m.phone && m.dateJoin && m.bobDate);
      const invalid = mapped.filter((m) => !m.displayName || !m.phone || !m.dateJoin || !m.bobDate);

      let extraSkipReasons = {};
      if (program?.ageGroups?.length) {
        const ageGroupSkips = [];
        const ageGroupPass = [];
        for (const m of valid) {
          const decimalAge = getDecimalAge(m.bobDate, m.dateJoin);
          const matched = program.ageGroups.find((g) => decimalAge >= g.startAge && decimalAge < g.endAge);
          if (matched) {
            ageGroupPass.push(m);
          } else {
            ageGroupSkips.push(m);
            extraSkipReasons[m.index] = `no age group matches age ${decimalAge.toFixed(2)}`;
          }
        }
        valid = ageGroupPass;
        for (const m of ageGroupSkips) {
          invalid.push({ ...m, missingAgeGroup: true, _extraSkipReason: extraSkipReasons[m.index] });
        }
      }

      preview[key] = {
        label: cfg.label,
        total: rows.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        uniqueAgents: [...new Set(mapped.filter((m) => m.agentRaw).map((m) => m.agentRaw))].sort(),
        sample: mapped.slice(0, 3),
        invalidList: invalid,
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
    const { userId, programId, files = ["mayra", "vivah"], applicationNumberConfig } = body;
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
      const cfg = COMMON_FIELDS[fileKey];
      if (!cfg) continue;
      const rows = loadJson(path.join(DATA_DIR, `${fileKey}.json`));
      const tableResult = { success: 0, skipped: 0, errors: 0, details: [] };

      console.log(`\n--- Starting ${fileKey} (${rows.length} rows) ---`);
      let fileProgress = 0;

      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          const md = mapRow(row, fileKey);

          if (!md.displayName) { tableResult.skipped++; tableResult.details.push({ index: i, oldMemberId: md.oldMemberId, status: "skipped", reason: "missing name", rawDob: row.Dob, rawJoinDate: row["Joning Date"] }); continue; }
          if (!md.dateJoin) { tableResult.skipped++; tableResult.details.push({ index: i, oldMemberId: md.oldMemberId, name: md.displayName, status: "skipped", reason: "missing/invalid join date", rawDob: row.Dob, rawJoinDate: row["Joning Date"] }); continue; }
          if (!md.bobDate) { tableResult.skipped++; tableResult.details.push({ index: i, oldMemberId: md.oldMemberId, name: md.displayName, status: "skipped", reason: "missing/invalid dob", rawDob: row.Dob, rawJoinDate: row["Joning Date"] }); continue; }

          const decimalAge = getDecimalAge(md.bobDate, md.dateJoin);
          const matchedAgeGroup = program.ageGroups.find((g) => decimalAge >= g.startAge && decimalAge < g.endAge);
          if (!matchedAgeGroup) { tableResult.skipped++; tableResult.details.push({ index: i, oldMemberId: md.oldMemberId, name: md.displayName, status: "skipped", reason: `no age group matches age ${decimalAge.toFixed(2)}`, rawDob: row.Dob, rawJoinDate: row["Joning Date"] }); continue; }

          counters.total++;
          fileProgress++;
          const regNo = "R" + generate6DigitRegNo();
          const memberNumber = ++counters.memberCount;
          const village = md.cityVillage || "";
          const matchedLocationGroup = program.locationGroups?.find((g) => g.location === village);
          const defaultLocation = program.locationGroups?.[0] || null;

          const normalizedAgent = normalizeAgentName(md.agentRaw);
          let matchedAgent = findMatchingAgent(normalizedAgent, agents);
          if (!matchedAgent) {
            matchedAgent = findMatchingAgent("m.j.", agents) || null;
          }

          const password = generateMemberPassword(md.displayName, md.bobDate);
          const now = admin.firestore.FieldValue.serverTimestamp();
          const regDateTimestamp = toFirestoreTimestamp(md.dateJoin);

          let appNo = md.oldMemberId || "";

          const docData = {
            uid: "",
            displayName: md.displayName,
            fatherName: md.fatherName,
            motherName: "",
            phone: md.phone,
            phoneAlt: "",
            aadhaarNo: md.aadhaarNo,
            gotra: md.gotra,
            jati: md.caste,
            address: md.address,
            pinCode: "",
            village: md.cityVillage,
            city: md.cityVillage,
            district: md.district,
            state: md.state,
            gender: md.gender,
            bobDate: md.bobDate,
            dateJoin: md.dateJoin,
            age: Math.floor(decimalAge),
            cast: md.caste,
            kistAmount: md.emiPerEvent,
            payAmount: matchedAgeGroup.payAmount || 0,
            joinFees: matchedAgeGroup.joinFee || 0,
            applicationNumber: appNo,
            guardian: md.nominee,
            guardianRelation: md.nomineeRelation,
            guardianAadharNo: md.nomineeAadhar,
            ageGroup: matchedAgeGroup.id,
            ageGroupRange: `${matchedAgeGroup.startAge}-${matchedAgeGroup.endAge}`,
            memberGroup: (matchedLocationGroup || defaultLocation)?.groupName || "Group_A",
            locationGroup: (matchedLocationGroup || defaultLocation)?.location || village,
            locactionGroupId: (matchedLocationGroup || defaultLocation)?.id || "",
            registrationNumber: regNo,
            memberNumber,
            programId,
            programName: program.name,
            agentId: matchedAgent?.id || null,
            agentName: matchedAgent?.displayName || md.agentRaw || null,
            joinFeesDone: md.givenJoiningFee > 0,
            joinFeesTxtId: "",
            joinFeesPaymentType: md.givenJoiningFee > 0 ? "custom" : "",
            joinFeesPaidAmount: md.givenJoiningFee || 0,
            joinFeesRemainingAmount: md.pendingJoiningFee > 0 ? md.pendingJoiningFee : (matchedAgeGroup.joinFee - (md.givenJoiningFee || 0)),
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
            migratedFrom: `excel_${fileKey}`,
            oldRecordIndex: i,
            oldMemberId: md.oldMemberId,
            createdAt: regDateTimestamp || now,
            updatedAt: now,
          };

          const memberRef = db.collection(memberCollectionPath).doc(regNo);
          const memberId = regNo;
          docData.uid = memberId;
          await memberRef.set(docData);
          console.log(`  ${fileKey} [${fileProgress}/${rows.length}] ${md.displayName} -> ${memberId}`);
          await programRef.update({ memberCount: admin.firestore.FieldValue.increment(1) });

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
    const snap = await db.collection(coll).where("migratedFrom", "in", ["excel_mayra", "excel_vivah"]).get();
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
