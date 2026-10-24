import { NextResponse } from "next/server";
import { parseBankSms } from "@/lib/bankSmsParser";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { smsBody, senderAddress } = body;

    if (!smsBody || typeof smsBody !== "string") {
      return NextResponse.json({ success: false, error: "smsBody string is required" }, { status: 400 });
    }

    const parsed = parseBankSms(smsBody, senderAddress || "");

    return NextResponse.json({
      success: true,
      isFinancialTransaction: parsed !== null,
      transaction: parsed,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
