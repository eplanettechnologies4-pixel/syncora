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
    const { dispatchId, isPrinted } = body;

    if (!dispatchId || typeof dispatchId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Dispatch ID is required" },
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
      isPrinted: false,
      printedAt: null,
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

    // 3. Determine next print status
    const targetPrinted =
      typeof isPrinted === "boolean" ? isPrinted : !Boolean(parsedNotes.isPrinted);

    parsedNotes.isPrinted = targetPrinted;
    if (targetPrinted) {
      parsedNotes.printedAt = new Date().toISOString();
    } else {
      parsedNotes.printedAt = null;
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
      console.error("Print status update failed");
      return NextResponse.json(
        { ok: false, error: "Failed to update print status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      success: true,
      dispatchId,
      isPrinted: targetPrinted,
      printedAt: parsedNotes.printedAt,
    });
  } catch (error: any) {
    console.error("Print status update error");
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
