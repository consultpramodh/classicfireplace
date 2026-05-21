import { NextRequest, NextResponse } from "next/server";
import { getCustomerHistory } from "@/lib/serviceops/customer-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const customerId = params.get("customerId") || params.get("customerNumber") || "";
  const customerNumber = params.get("customerNumber") || customerId;
  const email = params.get("email") || "";
  const phone = params.get("phone") || "";
  const altPhone = params.get("altPhone") || "";

  if (!customerId && !customerNumber && !email && !phone && !altPhone) {
    return NextResponse.json(
      { ok: false, message: "Provide customerId, customerNumber, email, phone, or altPhone." },
      { status: 400 }
    );
  }

  const history = getCustomerHistory({ customerId, customerNumber, email, phone, altPhone });
  return NextResponse.json({ ok: true, history });
}
