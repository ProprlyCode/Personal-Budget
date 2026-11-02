// Generates e2e/fixtures/sample-account-summary.pdf: a made-up "Your Account
// Summary" in the layout of Lincoln Financial's PDF (no real data).
// Run: node e2e/fixtures/make-sample-statement.js
const { chromium } = require("@playwright/test");
const path = require("path");
const row = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
const header = p => `<div class="hdr"><div>Your Account Summary</div><div>01/05/2026 - 02/04/2026</div><div>Page ${p} of 2</div><div class="who">TAYLOR SAMPLE<br>Plan: EXAMPLE CO SAVINGS PLAN</div></div>`;
const funds = [
  ["Smpl 500 Indx", "U.S. Equity", "20.000", "300.000", "$6,000.00", "$5,700.00", "$300.00", "$0.00", "$0.00", "$6,000.00"],
  ["Smpl Midcp Grwth", "U.S. Equity", "100.000", "15.000", "$1,500.00", "$1,500.00", "$120.00", "$0.00", "-$120.00", "$1,500.00"],
  ["Smpl Intl Value", "International Equity", "50.000", "40.000", "$2,000.00", "$1,895.00", "$120.00", "$0.00", "-$15.00", "$2,000.00"],
  ["Smpl Bond Srs", "Taxable Bond", "100.000", "10.000", "$1,000.00", "$900.00", "$60.00", "$10.00", "$30.00", "$1,000.00"]
];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font:12px Arial,sans-serif;margin:30px} .hdr{position:relative;text-align:center;margin-bottom:20px} .who{position:absolute;right:0;top:0;text-align:right;font-size:9px}
  h2{font-size:14px;margin:18px 0 6px} table{border-collapse:collapse;width:100%} td{padding:3px 6px} .pb{page-break-before:always}
</style></head><body>
${header(1)}
<h2>Activity</h2><table style="width:50%">
${row(["Beginning Balance", "$9,995.00"])}${row(["Contributions", "$600.00"])}${row(["Employee", "$400.00"])}${row(["Employer", "$200.00"])}
${row(["Distributions", "$0.00"])}${row(["Fees &amp; Expenses*", "$0.00"])}${row(["Other", "$10.00"])}${row(["Gain/Loss", "-$105.00"])}
${row(["Ending Balance", "$10,500.00"])}${row(["Net Change", "$505.00"])}</table>
<h2>Holdings By Contribution Type</h2><table>${row(["Contribution Type", "Source", "Contributions", "Balance"])}
${row(["Employee Salary Deferral", "Employee", "$200.00", "$4,000.00"])}${row(["Employer Match", "Employer", "$200.00", "$3,500.00"])}${row(["Roth", "Employee", "$200.00", "$3,000.00"])}
${row(["", "Total", "$600.00", "$10,500.00"])}</table>
<h2>Holdings By Investment</h2><table>${row(["Investment", "Asset Class", "Units", "Price", "Trade Date", "Balance"])}
${funds.map(f => row([f[0], f[1], f[2], f[3], "01/30/2026", f[4]])).join("")}${row(["Total", "", "", "", "", "$10,500.00"])}</table>
<div class="pb"></div>${header(2)}
<h2>Activity By Investment</h2><table>${row(["Beginning Balance", "Contribution", "Distributions", "Exchanges", "Fees &amp; Expenses*", "Other", "Gain / Loss", "Ending Balance", "Net Change", "PRR**"])}
${funds.map(f => row([f[0]]) + row([f[5], f[6], "$0.00", "$0.00", "$0.00", f[7], f[8], f[9], "$0.00", "0.00%"])).join("")}
${row(["Total"])}${row(["$9,995.00", "$600.00", "$0.00", "$0.00", "$0.00", "$10.00", "-$105.00", "$10,500.00", "$505.00"])}</table>
<h2>Transactions</h2><table>${row(["Description", "Type", "Trade Date", "Processed Date", "Amount"])}
${row(["Increase Ordinary Dividend Reinvest", "Adjustment", "01/27/2026", "01/27/2026", "$10.00"])}
${[23, 23, 23, 9, 9, 9].map(d => row(["Ach Contribution", "Contribution", `01/${String(d).padStart(2, "0")}/2026`, `01/${String(d).padStart(2, "0")}/2026`, "$100.00"])).join("")}</table>
<p style="font-size:9px">Lincoln Financial is the marketing name used in this made-up sample; all data is fictional.</p>
</body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(html);
  await p.pdf({ path: path.join(__dirname, "sample-account-summary.pdf"), format: "Letter" });
  await b.close();
  console.log("wrote sample-account-summary.pdf");
})();
