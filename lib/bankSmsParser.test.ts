import { parseBankSms } from "./bankSmsParser";

function runTests() {
  const tests = [
    {
      name: "Standard Debit SMS (HDFC)",
      sms: "Dear Customer, INR 350.00 debited from A/c **1234 on 24-OCT-26 to SWIGGY via UPI. Ref: 429381029381. Avl Bal: INR 12,450.00",
      sender: "VM-HDFCBK",
      expect: { amount: 350, type: "expense", bank: "HDFC Bank", category: "food", paymentMethod: "UPI", refNumber: "429381029381" }
    },
    {
      name: "Incoming Credit (SBI)",
      sms: "Your A/c 5678 is credited with INR 5,000.00 on 24-OCT-26 by Salary/TRANSFER from GOOGLE. Avl Bal Rs 55,000. Ref no 928301928301.",
      sender: "VK-SBIINB",
      expect: { amount: 5000, type: "income", bank: "State Bank of India", category: "salary", refNumber: "928301928301" }
    },
    {
      name: "UPI Outgoing (ICICI)",
      sms: "UPI payment of Rs. 40.00 made successfully to tea.stall@okaxis on 24-10-2026. Ref: 394820193820.",
      sender: "AD-ICICIB",
      expect: { amount: 40, type: "expense", bank: "ICICI Bank", paymentMethod: "UPI" }
    },
    {
      name: "Card Fuel Transaction (Axis)",
      sms: "INR 1,200.00 spent on Axis Bank Card ending 9876 at HPCL FUEL PUMP on 24-Oct-26. Avl Limit: INR 45,000.",
      sender: "AX-AXISBK",
      expect: { amount: 1200, type: "expense", bank: "Axis Bank", category: "fuel", paymentMethod: "CARD" }
    },
    {
      name: "Failed Transaction (Ignored)",
      sms: "Transaction of INR 750.00 on A/c **1234 failed due to insufficient funds.",
      sender: "VM-HDFCBK",
      expectNull: true
    },
    {
      name: "OTP Message (Ignored)",
      sms: "Your OTP for transaction of Rs. 999.00 on ICICI Bank Card is 482910. Do not share with anyone.",
      sender: "AD-ICICIB",
      expectNull: true
    },
    {
      name: "Marketing Loan SMS (Ignored)",
      sms: "Congratulations! You are pre-approved for an instant loan of Rs. 5,00,000. Apply now at sbi.co.in/loans",
      sender: "VK-SBIINB",
      expectNull: true
    }
  ];

  let passed = 0;
  for (const t of tests) {
    const res = parseBankSms(t.sms, t.sender);
    if (t.expectNull) {
      if (res === null) {
        console.log(`✅ Passed: ${t.name} (Correctly rejected)`);
        passed++;
      } else {
        console.error(`❌ Failed: ${t.name} (Expected null, got:`, res);
      }
    } else {
      if (!res) {
        console.error(`❌ Failed: ${t.name} (Got null)`);
        continue;
      }
      let ok = true;
      for (const [k, v] of Object.entries(t.expect || {})) {
        if ((res as any)[k] !== v) {
          console.error(`❌ Failed: ${t.name} for key ${k}: expected ${v}, got ${(res as any)[k]}`);
          ok = false;
        }
      }
      if (ok) {
        console.log(`✅ Passed: ${t.name} (Extracted ₹${res.amount} ${res.type} from ${res.bank})`);
        passed++;
      }
    }
  }

  console.log(`\nResults: ${passed}/${tests.length} tests passed.`);
}

runTests();
