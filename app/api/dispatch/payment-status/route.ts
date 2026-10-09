import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireShopAccess } from "@/lib/auth/shop-context";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let shopAccess;
  try {
    shopAccess = await requireShopAccess();
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Unauthorized" },
      { status: err.status || 401 }
    );
  }
  const { shopId } = shopAccess;

  try {
    const body = await request.json();
    const { dispatchId, paymentStatus } = body;

    if (!dispatchId || typeof dispatchId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Dispatch ID is required" },
        { status: 400 }
      );
    }

    if (!paymentStatus || (paymentStatus !== "paid" && paymentStatus !== "unpaid")) {
      return NextResponse.json(
        { ok: false, error: "Invalid payment status. Must be 'paid' or 'unpaid'." },
        { status: 400 }
      );
    }

    // 1. Fetch current record scoped by shop_id
    const { data: record, error: fetchErr } = await supabaseAdmin
      .from("manual_dispatches")
      .select("id, notes")
      .eq("id", dispatchId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (fetchErr || !record) {
      return NextResponse.json(
        { ok: false, error: "Dispatch not found" },
        { status: 404 }
      );
    }

    // 2. Parse current notes/metadata
    let parsedNotes: any = {
      text: "",
      paymentStatus: "unpaid",
      pricing: null,
    };

    if (record.notes && typeof record.notes === "string") {
      if (record.notes.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(record.notes);
          if (parsed && typeof parsed === "object") {
            parsedNotes = parsed;
          }
        } catch {
          parsedNotes.text = record.notes;
        }
      } else {
        parsedNotes.text = record.notes;
      }
    }

    // 3. Update payment status & timestamp
    parsedNotes.paymentStatus = paymentStatus;
    if (paymentStatus === "paid") {
      parsedNotes.paidAt = new Date().toISOString();
    } else {
      parsedNotes.paidAt = null;
    }

    const updatedNotesString = JSON.stringify(parsedNotes);

    // 4. Update row in Supabase scoped by shop_id
    const { error: updateErr } = await supabaseAdmin
      .from("manual_dispatches")
      .update({
        notes: updatedNotesString,
      })
      .eq("id", dispatchId)
      .eq("shop_id", shopId);

    if (updateErr) {
      console.error("Payment status update failed");
      return NextResponse.json(
        { ok: false, error: "Failed to update payment status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      success: true,
      dispatchId,
      paymentStatus,
      paidAt: parsedNotes.paidAt,
    });
  } catch (error: any) {
    console.error("Payment status update error");
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
