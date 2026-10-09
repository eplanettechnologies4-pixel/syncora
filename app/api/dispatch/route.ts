import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireShopAccess } from "@/lib/auth/shop-context";
import { queryShopifyAdminForShop } from "@/lib/shopify/shop-client";

export const dynamic = "force-dynamic";

interface DispatchItemInput {
  variantId: string;
  quantity: number;
  packSize?: string;
}

interface DispatchRequestBody {
  recipientName: string;
  dispatchDate?: string;
  address?: string;
  phone?: string;
  notes?: string;
  paymentStatus?: "paid" | "unpaid";
  packagingType?: "TUBES" | "JAR" | "TUBE + JAR" | string;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  discount?: {
    type?: "percentage" | "fixed";
    value?: number;
    amount?: number;
  };
  items: DispatchItemInput[];
}

interface EditDispatchRequestBody extends DispatchRequestBody {
  dispatchId: string;
}

/**
 * Helper to sync quantity to Shopify available inventory scoped by shopId.
 */
async function syncQuantityToShopifyForShop(
  shopId: string,
  shopifyVariantId: number,
  targetQuantity: number,
  fallbackCurrentQty: number,
  idempotencyKey: string
) {
  const shopifyVariantGid = `gid://shopify/ProductVariant/${shopifyVariantId}`;
  const variantQuery = `
    query GetVariantInventory($id: ID!) {
      productVariant(id: $id) {
        id
        inventoryItem {
          id
          inventoryLevels(first: 1) {
            edges {
              node {
                location {
                  id
                }
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const variantRes = await queryShopifyAdminForShop(shopId, variantQuery, { id: shopifyVariantGid });
  const variantData = variantRes?.data?.productVariant;

  if (!variantData?.inventoryItem) {
    throw new Error("Variant inventoryItem not found on Shopify");
  }

  const inventoryItemId = variantData.inventoryItem.id;
  const invLevels = variantData.inventoryItem.inventoryLevels?.edges || [];

  if (invLevels.length === 0 || !invLevels[0].node?.location?.id) {
    throw new Error("No inventory location found on Shopify");
  }

  const locationId = invLevels[0].node.location.id;
  const currentQuantities = invLevels[0].node.quantities || [];
  const availableObj = currentQuantities.find((q: any) => q.name === "available");
  const currentShopifyQty =
    typeof availableObj?.quantity === "number" ? availableObj.quantity : fallbackCurrentQty;

  const setInvMutation = `
    mutation SetInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
      inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        inventoryAdjustmentGroup {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const mutRes = await queryShopifyAdminForShop(shopId, setInvMutation, {
    idempotencyKey,
    input: {
      name: "available",
      reason: "correction",
      quantities: [
        {
          inventoryItemId,
          locationId,
          quantity: targetQuantity,
          changeFromQuantity: currentShopifyQty,
        },
      ],
    },
  });

  const userErrors = mutRes?.data?.inventorySetQuantities?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(`Shopify error: ${userErrors[0].message}`);
  }
}

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
    const body: DispatchRequestBody = await request.json();
    const {
      recipientName,
      dispatchDate,
      address,
      phone,
      notes,
      paymentStatus,
      packagingType,
      items,
    } = body;

    // 1. Validate recipient and items
    if (!recipientName || typeof recipientName !== "string" || !recipientName.trim()) {
      return NextResponse.json(
        { ok: false, error: "Recipient name is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "At least one line item is required" },
        { status: 400 }
      );
    }

    // 2. Validate line items, quantities, shop ownership, and stock
    const validatedItems: Array<{
      variantId: string;
      quantity: number;
      invRowId: string;
      quantityBefore: number;
      quantityAfter: number;
      shopifyVariantId: number | null;
      itemTitle: string;
      unitPrice: number;
      totalPrice: number;
      packSize: string;
    }> = [];

    for (const item of items) {
      const parsedQty = Number(item.quantity);
      if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
        return NextResponse.json(
          { ok: false, error: "Quantity must be a positive whole number" },
          { status: 400 }
        );
      }

      if (!item.variantId || typeof item.variantId !== "string") {
        return NextResponse.json(
          { ok: false, error: "Missing variant ID for line item" },
          { status: 400 }
        );
      }

      // Lookup variant scoped by shop_id
      const { data: variantRow, error: varErr } = await supabaseAdmin
        .from("product_variants")
        .select(`
          id,
          shopify_variant_id,
          title,
          price,
          products (
            id,
            title,
            price_min
          )
        `)
        .eq("id", item.variantId)
        .eq("shop_id", shopId)
        .maybeSingle();

      if (varErr || !variantRow) {
        return NextResponse.json(
          { ok: false, error: `Variant not found in active store: ${item.variantId}` },
          { status: 404 }
        );
      }

      // Check current stock in inventory scoped by shop_id
      const { data: invRow, error: invErr } = await supabaseAdmin
        .from("inventory")
        .select("id, quantity")
        .eq("variant_id", item.variantId)
        .eq("shop_id", shopId)
        .maybeSingle();

      if (invErr || !invRow) {
        return NextResponse.json(
          { ok: false, error: `No inventory record found for variant ID ${item.variantId}` },
          { status: 404 }
        );
      }

      if (invRow.quantity < parsedQty) {
        const productTitle = (variantRow.products as any)?.title || "Product";
        const variantTitle = variantRow.title && variantRow.title !== "Default Title" ? ` (${variantRow.title})` : "";
        return NextResponse.json(
          {
            ok: false,
            error: `Insufficient stock for "${productTitle}${variantTitle}". Requested ${parsedQty}, available ${invRow.quantity}.`,
          },
          { status: 400 }
        );
      }

      // Take unit prices from product_variants.price in the database and never from the browser
      const dbPrice =
        typeof variantRow.price === "number" && variantRow.price > 0
          ? variantRow.price
          : typeof (variantRow.products as any)?.price_min === "number" && (variantRow.products as any).price_min > 0
          ? (variantRow.products as any).price_min
          : 0;

      const itemTotalPrice = dbPrice * parsedQty;
      const itemPackSize = typeof item.packSize === "string" && item.packSize.trim() ? item.packSize.trim() : "100ml";
      const fullTitle = `${(variantRow.products as any)?.title || "Product"}${variantRow.title && variantRow.title !== "Default Title" ? ` (${variantRow.title})` : ""}`;

      validatedItems.push({
        variantId: item.variantId,
        quantity: parsedQty,
        invRowId: invRow.id,
        quantityBefore: invRow.quantity,
        quantityAfter: invRow.quantity - parsedQty,
        shopifyVariantId: variantRow.shopify_variant_id || null,
        itemTitle: fullTitle,
        unitPrice: dbPrice,
        totalPrice: itemTotalPrice,
        packSize: itemPackSize,
      });
    }

    // 3. Subtotal is the sum of price times quantity
    const subtotal = validatedItems.reduce((acc, it) => acc + it.totalPrice, 0);

    // 4. Validate discount: percentage 0-100 or fixed amount not exceeding subtotal
    const discountType = (body.discountType || body.discount?.type || "percentage") === "fixed" ? "fixed" : "percentage";
    const rawDiscountValue = Number(body.discountValue ?? body.discount?.value ?? 0);

    if (isNaN(rawDiscountValue) || rawDiscountValue < 0) {
      return NextResponse.json(
        { ok: false, error: "Discount value must be a non-negative number" },
        { status: 400 }
      );
    }

    let discountAmount = 0;
    if (discountType === "percentage") {
      if (rawDiscountValue > 100) {
        return NextResponse.json(
          { ok: false, error: "Discount percentage must not exceed 100%" },
          { status: 400 }
        );
      }
      discountAmount = Math.round(((subtotal * rawDiscountValue) / 100) * 100) / 100;
    } else {
      if (rawDiscountValue > subtotal) {
        return NextResponse.json(
          { ok: false, error: "Discount amount cannot exceed subtotal" },
          { status: 400 }
        );
      }
      discountAmount = Math.round(rawDiscountValue * 100) / 100;
    }

    // Total is subtotal minus discount, rounded to 2 decimals
    const totalAmount = Math.round(Math.max(0, subtotal - discountAmount) * 100) / 100;

    // 5. Build notes JSON structure, keeping compatibility and adding discountType and discountValue
    const effectivePaymentStatus: "paid" | "unpaid" = paymentStatus === "paid" ? "paid" : "unpaid";
    const effectivePackagingType = packagingType ? String(packagingType).toUpperCase().trim() : "TUBES";

    const notesToSave = JSON.stringify({
      text: notes?.trim() || "",
      dispatchDate: dispatchDate?.trim() || null,
      address: address?.trim() || "",
      phone: phone?.trim() || "",
      paymentStatus: effectivePaymentStatus,
      paidAt: effectivePaymentStatus === "paid" ? new Date().toISOString() : null,
      isPrinted: false,
      printedAt: null,
      packagingType: effectivePackagingType,
      discountType,
      discountValue: rawDiscountValue,
      pricing: {
        subtotal,
        discount: {
          type: discountType,
          value: rawDiscountValue,
          amount: discountAmount,
        },
        totalAmount,
        items: validatedItems.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          packSize: it.packSize,
        })),
      },
    });

    const totalQuantity = validatedItems.reduce((acc, it) => acc + it.quantity, 0);
    const dispatchId = crypto.randomUUID();

    let createdAtToSave: string | undefined = undefined;
    if (dispatchDate && typeof dispatchDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dispatchDate.trim())) {
      const now = new Date();
      const [year, month, day] = dispatchDate.trim().split("-").map(Number);
      const customDate = new Date(Date.UTC(year, month - 1, day, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
      if (!isNaN(customDate.getTime())) {
        createdAtToSave = customDate.toISOString();
      }
    }

    // 6. Apply stock changes to Shopify with a unique idempotency key per dispatch and variant
    const appliedShopifyChanges: Array<{
      shopifyVariantId: number;
      originalQty: number;
      targetQty: number;
    }> = [];

    try {
      for (const item of validatedItems) {
        if (item.shopifyVariantId) {
          const idempotencyKey = `${dispatchId}-${item.variantId}`;
          await syncQuantityToShopifyForShop(
            shopId,
            item.shopifyVariantId,
            item.quantityAfter,
            item.quantityBefore,
            idempotencyKey
          );
          appliedShopifyChanges.push({
            shopifyVariantId: item.shopifyVariantId,
            originalQty: item.quantityBefore,
            targetQty: item.quantityAfter,
          });
        }
      }
    } catch (shopifyErr: any) {
      console.error("Shopify stock adjustment failed");
      // Put back stock changes already applied
      for (const change of appliedShopifyChanges) {
        try {
          const rollbackKey = `${dispatchId}-${change.shopifyVariantId}-rollback`;
          await syncQuantityToShopifyForShop(
            shopId,
            change.shopifyVariantId,
            change.originalQty,
            change.targetQty,
            rollbackKey
          );
        } catch {
          console.error("Shopify rollback failed");
        }
      }
      return NextResponse.json(
        { ok: false, error: "Failed to update stock in Shopify" },
        { status: 500 }
      );
    }

    // 7. Database updates: inventory, manual_dispatches, manual_dispatch_items
    try {
      // Decrement inventory rows
      for (const item of validatedItems) {
        const { error: invUpErr } = await supabaseAdmin
          .from("inventory")
          .update({
            quantity: item.quantityAfter,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.invRowId)
          .eq("shop_id", shopId);

        if (invUpErr) throw invUpErr;
      }

      // Insert manual_dispatches row with shop_id
      const insertPayload: Record<string, any> = {
        id: dispatchId,
        shop_id: shopId,
        recipient_name: recipientName.trim(),
        notes: notesToSave,
        total_quantity: totalQuantity,
      };
      if (createdAtToSave) {
        insertPayload.created_at = createdAtToSave;
      }

      const { error: dispatchErr } = await supabaseAdmin
        .from("manual_dispatches")
        .insert(insertPayload);

      if (dispatchErr) throw dispatchErr;

      // Insert manual_dispatch_items rows with shop_id
      const itemsToInsert = validatedItems.map((it) => ({
        dispatch_id: dispatchId,
        shop_id: shopId,
        variant_id: it.variantId,
        quantity: it.quantity,
        quantity_before: it.quantityBefore,
        quantity_after: it.quantityAfter,
      }));

      const { error: itemsErr } = await supabaseAdmin
        .from("manual_dispatch_items")
        .insert(itemsToInsert);

      if (itemsErr) throw itemsErr;

    } catch (dbErr: any) {
      console.error("Database insert failed");
      // If database insert fails, restore stock in Shopify
      for (const change of appliedShopifyChanges) {
        try {
          const rollbackKey = `${dispatchId}-${change.shopifyVariantId}-dbrestore`;
          await syncQuantityToShopifyForShop(
            shopId,
            change.shopifyVariantId,
            change.originalQty,
            change.targetQty,
            rollbackKey
          );
        } catch {
          console.error("Shopify rollback failed");
        }
      }
      return NextResponse.json(
        { ok: false, error: "Failed to record dispatch in database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      success: true,
      dispatchId,
      totalQuantity,
    });
  } catch (error: any) {
    console.error("Manual dispatch error");
    return NextResponse.json(
      { ok: false, error: "Failed to process manual dispatch" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
    const body: EditDispatchRequestBody = await request.json();
    const {
      dispatchId,
      recipientName,
      dispatchDate,
      address,
      phone,
      notes,
      paymentStatus,
      packagingType,
      items,
    } = body;

    // 1. Validation
    if (!dispatchId || typeof dispatchId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Dispatch ID is required" },
        { status: 400 }
      );
    }

    if (!recipientName || typeof recipientName !== "string" || !recipientName.trim()) {
      return NextResponse.json(
        { ok: false, error: "Recipient name is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "At least one line item is required" },
        { status: 400 }
      );
    }

    // 2. Fetch existing dispatch record scoped by shop_id
    const { data: existingDispatch, error: dispatchErr } = await supabaseAdmin
      .from("manual_dispatches")
      .select("id, notes, total_quantity, created_at")
      .eq("id", dispatchId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (dispatchErr || !existingDispatch) {
      return NextResponse.json(
        { ok: false, error: "Dispatch not found" },
        { status: 404 }
      );
    }

    // 3. Fetch existing line items scoped by shop_id
    const { data: existingItems, error: itemsErr } = await supabaseAdmin
      .from("manual_dispatch_items")
      .select("id, variant_id, quantity")
      .eq("dispatch_id", dispatchId)
      .eq("shop_id", shopId);

    if (itemsErr) {
      console.error("Fetch existing items error");
      return NextResponse.json(
        { ok: false, error: "Failed to load existing dispatch items" },
        { status: 500 }
      );
    }

    // Map existing quantities by variant_id
    const oldVariantMap = new Map<string, number>();
    (existingItems || []).forEach((row: any) => {
      oldVariantMap.set(
        row.variant_id,
        (oldVariantMap.get(row.variant_id) || 0) + row.quantity
      );
    });

    // Map new quantities and validate input
    const newVariantMap = new Map<string, number>();
    for (const it of items) {
      const parsedQty = Number(it.quantity);
      if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
        return NextResponse.json(
          { ok: false, error: "Quantity must be a positive whole number" },
          { status: 400 }
        );
      }
      if (!it.variantId || typeof it.variantId !== "string") {
        return NextResponse.json(
          { ok: false, error: "Missing variant ID for line item" },
          { status: 400 }
        );
      }
      newVariantMap.set(it.variantId, (newVariantMap.get(it.variantId) || 0) + parsedQty);
    }

    // 4. Validate stock changes for all affected variants scoped by shop_id
    const allVariantIds = Array.from(new Set(Array.from(oldVariantMap.keys()).concat(Array.from(newVariantMap.keys()))));
    const variantInventoryInfo = new Map<
      string,
      {
        invRowId: string;
        currentStock: number;
        newStock: number;
        deltaStock: number;
        shopifyVariantId: number | null;
        dbPrice: number;
      }
    >();

    for (const varId of allVariantIds) {
      // Variant lookup scoped by id and shop_id
      const { data: vData, error: vErr } = await supabaseAdmin
        .from("product_variants")
        .select(`
          id,
          shopify_variant_id,
          price,
          products (
            price_min
          )
        `)
        .eq("id", varId)
        .eq("shop_id", shopId)
        .maybeSingle();

      if (vErr || !vData) {
        return NextResponse.json(
          { ok: false, error: `Variant not found in active store: ${varId}` },
          { status: 404 }
        );
      }

      const { data: invRow, error: invErr } = await supabaseAdmin
        .from("inventory")
        .select("id, quantity")
        .eq("variant_id", varId)
        .eq("shop_id", shopId)
        .maybeSingle();

      if (invErr || !invRow) {
        return NextResponse.json(
          { ok: false, error: `No inventory record found for variant ID ${varId}` },
          { status: 404 }
        );
      }

      const oldQty = oldVariantMap.get(varId) || 0;
      const newQty = newVariantMap.get(varId) || 0;
      const deltaQty = newQty - oldQty; // positive = deduct more; negative = return stock

      if (deltaQty > 0 && invRow.quantity < deltaQty) {
        return NextResponse.json(
          {
            ok: false,
            error: `Insufficient stock for variant ${varId}. Available: ${invRow.quantity}, requested additional: ${deltaQty}.`,
          },
          { status: 400 }
        );
      }

      const dbPrice =
        typeof vData.price === "number" && vData.price > 0
          ? vData.price
          : typeof (vData.products as any)?.price_min === "number" && (vData.products as any).price_min > 0
          ? (vData.products as any).price_min
          : 0;

      variantInventoryInfo.set(varId, {
        invRowId: invRow.id,
        currentStock: invRow.quantity,
        newStock: invRow.quantity - deltaQty,
        deltaStock: deltaQty,
        shopifyVariantId: vData.shopify_variant_id || null,
        dbPrice,
      });
    }

    // 5. Apply only the difference per variant
    for (const [varId, info] of Array.from(variantInventoryInfo.entries())) {
      if (info.deltaStock !== 0) {
        // Update Supabase inventory
        const { error: invUpErr } = await supabaseAdmin
          .from("inventory")
          .update({
            quantity: info.newStock,
            updated_at: new Date().toISOString(),
          })
          .eq("id", info.invRowId)
          .eq("shop_id", shopId);

        if (invUpErr) {
          console.error("Inventory delta update error");
        }

        // Apply difference to Shopify
        if (info.shopifyVariantId) {
          const idempotencyKey = `${dispatchId}-${varId}-${Date.now()}`;
          try {
            await syncQuantityToShopifyForShop(
              shopId,
              info.shopifyVariantId,
              info.newStock,
              info.currentStock,
              idempotencyKey
            );
          } catch {
            console.error("Shopify delta sync error");
          }
        }
      }
    }

    // 6. Delete old items in manual_dispatch_items
    await supabaseAdmin
      .from("manual_dispatch_items")
      .delete()
      .eq("dispatch_id", dispatchId)
      .eq("shop_id", shopId);

    // 7. Insert updated line items with DB unit prices
    const validatedNewItems = [];
    for (const item of items) {
      const parsedQty = Number(item.quantity);
      const info = variantInventoryInfo.get(item.variantId)!;

      const { error: insErr } = await supabaseAdmin
        .from("manual_dispatch_items")
        .insert({
          dispatch_id: dispatchId,
          shop_id: shopId,
          variant_id: item.variantId,
          quantity: parsedQty,
          quantity_before: info.currentStock,
          quantity_after: info.newStock,
        });

      if (insErr) {
        console.error("Dispatch item insert error");
      }

      const itemPackSize = typeof item.packSize === "string" && item.packSize.trim() ? item.packSize.trim() : "100ml";

      validatedNewItems.push({
        variantId: item.variantId,
        quantity: parsedQty,
        unitPrice: info.dbPrice,
        totalPrice: info.dbPrice * parsedQty,
        packSize: itemPackSize,
      });
    }

    // 8. Recompute financial calculations
    const subtotal = validatedNewItems.reduce((acc, it) => acc + it.totalPrice, 0);

    const discountType = (body.discountType || body.discount?.type || "percentage") === "fixed" ? "fixed" : "percentage";
    const rawDiscountValue = Number(body.discountValue ?? body.discount?.value ?? 0);

    let discountAmount = 0;
    if (discountType === "percentage") {
      const capped = Math.min(100, Math.max(0, rawDiscountValue));
      discountAmount = Math.round(((subtotal * capped) / 100) * 100) / 100;
    } else {
      const capped = Math.min(subtotal, Math.max(0, rawDiscountValue));
      discountAmount = Math.round(capped * 100) / 100;
    }

    const totalAmount = Math.round(Math.max(0, subtotal - discountAmount) * 100) / 100;

    // Parse existing notes to preserve flags
    let existingNotesMeta: any = {};
    if (existingDispatch.notes && existingDispatch.notes.trim().startsWith("{")) {
      try {
        existingNotesMeta = JSON.parse(existingDispatch.notes);
      } catch {}
    }

    const effectivePaymentStatus: "paid" | "unpaid" = paymentStatus === "paid" ? "paid" : "unpaid";
    const effectivePackagingType = packagingType
      ? String(packagingType).toUpperCase().trim()
      : (existingNotesMeta.packagingType || "TUBES");

    let paidAtToSave = existingNotesMeta.paidAt || null;
    if (effectivePaymentStatus === "paid" && !paidAtToSave) {
      paidAtToSave = new Date().toISOString();
    } else if (effectivePaymentStatus === "unpaid") {
      paidAtToSave = null;
    }

    const notesToSave = JSON.stringify({
      text: notes?.trim() || "",
      dispatchDate: dispatchDate?.trim() || null,
      address: address?.trim() || "",
      phone: phone?.trim() || "",
      paymentStatus: effectivePaymentStatus,
      paidAt: paidAtToSave,
      isPrinted: existingNotesMeta.isPrinted === true,
      printedAt: existingNotesMeta.printedAt || null,
      packagingType: effectivePackagingType,
      discountType,
      discountValue: rawDiscountValue,
      pricing: {
        subtotal,
        discount: {
          type: discountType,
          value: rawDiscountValue,
          amount: discountAmount,
        },
        totalAmount,
        items: validatedNewItems,
      },
    });

    const totalQuantity = validatedNewItems.reduce((acc, it) => acc + it.quantity, 0);

    const updatePayload: Record<string, any> = {
      recipient_name: recipientName.trim(),
      notes: notesToSave,
      total_quantity: totalQuantity,
    };

    if (dispatchDate && typeof dispatchDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dispatchDate.trim())) {
      const now = new Date();
      const [year, month, day] = dispatchDate.trim().split("-").map(Number);
      const customDate = new Date(Date.UTC(year, month - 1, day, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
      if (!isNaN(customDate.getTime())) {
        updatePayload.created_at = customDate.toISOString();
      }
    }

    const { error: updateDispatchErr } = await supabaseAdmin
      .from("manual_dispatches")
      .update(updatePayload)
      .eq("id", dispatchId)
      .eq("shop_id", shopId);

    if (updateDispatchErr) {
      console.error("Dispatch update error");
      return NextResponse.json(
        { ok: false, error: "Failed to update dispatch record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      success: true,
      dispatchId,
      totalQuantity,
    });
  } catch (error: any) {
    console.error("Dispatch update error");
    return NextResponse.json(
      { ok: false, error: "Failed to update manual dispatch" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
    let dispatchId: string | null = null;

    const { searchParams } = new URL(request.url);
    if (searchParams.get("id")) {
      dispatchId = searchParams.get("id");
    }

    if (!dispatchId) {
      try {
        const body = await request.json();
        if (body?.dispatchId) dispatchId = body.dispatchId;
      } catch {}
    }

    if (!dispatchId || typeof dispatchId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Dispatch ID is required" },
        { status: 400 }
      );
    }

    // 1. Fetch dispatch record scoped by shop_id
    const { data: dispatch, error: fetchErr } = await supabaseAdmin
      .from("manual_dispatches")
      .select("id, recipient_name")
      .eq("id", dispatchId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (fetchErr || !dispatch) {
      return NextResponse.json(
        { ok: false, error: "Dispatch not found" },
        { status: 404 }
      );
    }

    // 2. Fetch dispatch items scoped by shop_id
    const { data: dispatchItems, error: itemsFetchErr } = await supabaseAdmin
      .from("manual_dispatch_items")
      .select(`
        id,
        variant_id,
        quantity,
        product_variants (
          id,
          shopify_variant_id
        )
      `)
      .eq("dispatch_id", dispatchId)
      .eq("shop_id", shopId);

    if (itemsFetchErr) {
      console.error("Fetch items error");
    }

    // 3. Restore the stock for every item, then delete
    if (Array.isArray(dispatchItems) && dispatchItems.length > 0) {
      for (const item of dispatchItems) {
        if (!item.variant_id || !item.quantity) continue;

        const { data: invRow } = await supabaseAdmin
          .from("inventory")
          .select("id, quantity")
          .eq("variant_id", item.variant_id)
          .eq("shop_id", shopId)
          .maybeSingle();

        if (invRow) {
          const restoredQty = invRow.quantity + item.quantity;
          await supabaseAdmin
            .from("inventory")
            .update({
              quantity: restoredQty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", invRow.id)
            .eq("shop_id", shopId);

          const shopifyVariantId = (item.product_variants as any)?.shopify_variant_id;
          if (shopifyVariantId) {
            const idempotencyKey = `${dispatchId}-${item.variant_id}-restore`;
            try {
              await syncQuantityToShopifyForShop(
                shopId,
                shopifyVariantId,
                restoredQty,
                invRow.quantity,
                idempotencyKey
              );
            } catch {
              console.error("Shopify stock restoration error");
            }
          }
        }
      }
    }

    // 4. Delete items and parent dispatch record
    await supabaseAdmin
      .from("manual_dispatch_items")
      .delete()
      .eq("dispatch_id", dispatchId)
      .eq("shop_id", shopId);

    const { error: dispatchDeleteErr } = await supabaseAdmin
      .from("manual_dispatches")
      .delete()
      .eq("id", dispatchId)
      .eq("shop_id", shopId);

    if (dispatchDeleteErr) {
      console.error("Dispatch deletion error");
      return NextResponse.json(
        { ok: false, error: "Failed to delete dispatch record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      success: true,
      deletedId: dispatchId,
    });
  } catch (error: any) {
    console.error("Dispatch deletion error");
    return NextResponse.json(
      { ok: false, error: "Failed to delete dispatch" },
      { status: 500 }
    );
  }
}
