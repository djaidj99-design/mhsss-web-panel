import { NextResponse } from "next/server";
import admin from "../admin";

export async function POST(req) {
  const { action, email, password, uid, newPassword, newEmail, OrgData } = await req.json();

  try {
    if (action === "create") {
      // Check if user already exists
      try {
        await admin.auth().getUserByEmail(email);
        return NextResponse.json({ error: "User with this email already exists." }, { status: 400 });
      } catch (err) {
        if (err.code !== "auth/user-not-found") {
          return NextResponse.json({ error: err.message }, { status: 500 });
        }
      }

      // Create Auth user
      const userRecord = await admin.auth().createUser({ email, password });

      // ---- SET CUSTOM CLAIMS HERE ----
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        ...OrgData
      });

      return NextResponse.json({ success: true, user: userRecord });
    }

    if (action === "delete") {
      await admin.auth().deleteUser(uid);
      return NextResponse.json({ success: true });
    }

    if (action === "updatePassword") {
      await admin.auth().updateUser(uid, { password: newPassword });
      return NextResponse.json({ success: true });
    }

    if (action === "checkEmail") {
      try {
        await admin.auth().getUserByEmail(email);
        return NextResponse.json({ exists: true });
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          return NextResponse.json({ exists: false });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    if (action === "updateEmail") {
      if (!uid || !newEmail) {
        return NextResponse.json({ error: "uid and newEmail are required" }, { status: 400 });
      }
      // Check new email not already taken by another user
      try {
        const existing = await admin.auth().getUserByEmail(newEmail);
        if (existing.uid !== uid) {
          return NextResponse.json({ error: "This email is already in use by another account." }, { status: 400 });
        }
      } catch (err) {
        if (err.code !== "auth/user-not-found") {
          return NextResponse.json({ error: err.message }, { status: 500 });
        }
      }
      await admin.auth().updateUser(uid, { email: newEmail });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
