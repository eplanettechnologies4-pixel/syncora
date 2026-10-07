import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dispatchId, isPrinted } = body;

    if (!dispatchId || typeof dispatchId !== "string") {
      return NextResponse.json(
        { success: false, error: "Dispatch ID is required" },
        { status: 400 }
      );
    }

    // 1. Fetch current record
    const { data: record, error: fetchErr } = await supabaseAdmin
      .from("manual_dispatches")
      .select("id, notes")
      .eq("id", dispatchId)
      .maybeSingle();

    if (fetchErr || !record) {
      return NextResponse.json(
        { success: false, error: "Dispatch record not found" },
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

    // 4. Update row in Supabase
    const { error: updateErr } = await supabaseAdmin
      .from("manual_dispatches")
      .update({
        notes: updatedNotesString,
      })
      .eq("id", dispatchId);

    if (updateErr) {
      console.error("Error updating dispatch print status:", updateErr);
      return NextResponse.json(
        { success: false, error: "Failed to update print status in database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      dispatchId,
      isPrinted: targetPrinted,
      printedAt: parsedNotes.printedAt,
    });
  } catch (error: any) {
    console.error("Print status update error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
