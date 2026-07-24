// Builds a fully self-contained, styled HTML report document (no external
// assets) that survives both "open in a new tab → print to PDF" and "save
// as .html". All strings arrive pre-formatted/localized from the caller —
// this module only does layout, escaping, and print-safe styling.
//
// Colors follow the dataviz method: the categorical asset-class palette was
// run through the six-checks validator on the light surface (all pass;
// the two low-contrast greens are relieved by direct segment labels and
// the full table view below the bar). PnL is a status color pair and always
// carries a +/− sign, never color alone.

export interface ReportKpi {
  label: string;
  value: string;
  sub?: string;
  color?: string; // status color for PnL-style values
}

export interface ReportAllocSlice {
  name: string;
  color: string;
  pct: number; // 0-100
  valueText: string;
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: string[][];
  alignRight?: number[]; // column indexes that hold numbers
  colors?: Array<Array<string | null>>; // per-cell ink override (PnL columns)
  emptyText: string;
}

export interface ReportDoc {
  title: string;
  portfolioName: string;
  periodLabel: string;
  generatedLabel: string;
  kpis: ReportKpi[];
  allocationTitle: string;
  allocation: ReportAllocSlice[];
  tables: ReportTable[];
  footer: string;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const INK = "#1c2a24";
const MUTED = "#68766f";
const SURFACE = "#ffffff";
const PAGE_BG = "#f4f6f5";
const ACCENT = "#0fa876";

function kpiHtml(k: ReportKpi): string {
  return `<div class="kpi">
    <div class="kpi-label">${esc(k.label)}</div>
    <div class="kpi-value"${k.color ? ` style="color:${esc(k.color)}"` : ""}>${esc(k.value)}</div>
    ${k.sub ? `<div class="kpi-sub"${k.color ? ` style="color:${esc(k.color)}"` : ""}>${esc(k.sub)}</div>` : ""}
  </div>`;
}

function allocationHtml(title: string, slices: ReportAllocSlice[]): string {
  if (!slices.length) return "";
  // 2px surface gaps between segments; 4px rounded outer ends; direct %
  // labels on segments wide enough to hold them (relief for the contrast
  // WARN on the light greens), dark ink text — never white-on-light.
  const segments = slices
    .map((s, i) => {
      const first = i === 0;
      const last = i === slices.length - 1;
      const radius = `${first ? "4px" : "1px"} ${last ? "4px 4px" : "1px 1px"} ${first ? "4px" : "1px"}`;
      const label = s.pct >= 8 ? `<span class="seg-label">${s.pct.toFixed(0)}%</span>` : "";
      return `<div class="seg" style="width:${s.pct}%;background:${esc(s.color)};border-radius:${radius}">${label}</div>`;
    })
    .join("");
  const legend = slices
    .map(
      (s) =>
        `<span class="leg"><span class="chip" style="background:${esc(s.color)}"></span>${esc(s.name)} · ${s.pct.toFixed(1)}% (${esc(s.valueText)})</span>`
    )
    .join("");
  return `<div class="card">
    <div class="card-title">${esc(title)}</div>
    <div class="bar">${segments}</div>
    <div class="legend">${legend}</div>
  </div>`;
}

function tableHtml(tb: ReportTable): string {
  const right = new Set(tb.alignRight ?? []);
  const head = tb.headers
    .map((h, i) => `<th class="${right.has(i) ? "num" : ""}">${esc(h)}</th>`)
    .join("");
  const body = tb.rows.length
    ? tb.rows
        .map((row, r) => {
          const cells = row
            .map((cell, c) => {
              const color = tb.colors?.[r]?.[c];
              return `<td class="${right.has(c) ? "num" : ""}"${color ? ` style="color:${esc(color)};font-weight:600"` : ""}>${esc(cell)}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")
    : `<tr><td class="empty" colspan="${tb.headers.length}">${esc(tb.emptyText)}</td></tr>`;
  return `<div class="card">
    <div class="card-title">${esc(tb.title)}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </div>`;
}

export function buildReportHtml(doc: ReportDoc): string {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} — ${esc(doc.periodLabel)}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Anuphan', 'Noto Sans Thai', -apple-system, 'Segoe UI', sans-serif;
    background: ${PAGE_BG}; color: ${INK};
    padding: 28px 16px 40px;
    font-size: 13.5px; line-height: 1.55;
  }
  .sheet { max-width: 860px; margin: 0 auto; }
  .head {
    background: linear-gradient(120deg, ${ACCENT}, #0c8a90);
    color: #fff; border-radius: 16px; padding: 22px 26px; margin-bottom: 14px;
  }
  .head h1 { font-size: 21px; font-weight: 800; letter-spacing: -0.2px; }
  .head .meta { font-size: 12px; opacity: 0.92; margin-top: 5px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
  .kpi { background: ${SURFACE}; border-radius: 14px; padding: 13px 15px; border: 1px solid #e6ebe8; }
  .kpi-label { font-size: 11px; color: ${MUTED}; }
  .kpi-value { font-size: 18px; font-weight: 800; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .kpi-sub { font-size: 11px; margin-top: 1px; }
  .card { background: ${SURFACE}; border-radius: 14px; padding: 16px 18px; border: 1px solid #e6ebe8; margin-bottom: 14px; break-inside: avoid; }
  .card-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
  .bar { display: flex; height: 26px; }
  .seg { display: flex; align-items: center; justify-content: center; margin-right: 2px; min-width: 3px; }
  .seg:last-child { margin-right: 0; }
  .seg-label { font-size: 10.5px; font-weight: 700; color: #0b1512; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 11.5px; color: ${INK}; }
  .chip { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 11px; color: ${MUTED}; font-weight: 600; padding: 6px 8px; border-bottom: 1.5px solid #dfe6e2; }
  td { padding: 7px 8px; font-size: 12.5px; border-bottom: 1px solid #eef2ef; }
  tbody tr:nth-child(even) { background: #f8faf9; }
  th.num, td.num { text-align: right; }
  td.empty { text-align: center; color: ${MUTED}; padding: 18px; }
  .footer { text-align: center; font-size: 11px; color: ${MUTED}; margin-top: 18px; }
  @media print {
    body { background: #fff; padding: 0; font-size: 12px; }
    .sheet { max-width: none; }
    .kpi, .card { border: 1px solid #dde3df; }
    @page { margin: 14mm 12mm; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <h1>${esc(doc.title)}</h1>
    <div class="meta">${esc(doc.portfolioName)} · ${esc(doc.periodLabel)}</div>
    <div class="meta">${esc(doc.generatedLabel)}</div>
  </div>
  <div class="kpis">${doc.kpis.map(kpiHtml).join("")}</div>
  ${allocationHtml(doc.allocationTitle, doc.allocation)}
  ${doc.tables.map(tableHtml).join("")}
  <div class="footer">${esc(doc.footer)}</div>
</div>
</body>
</html>`;
}

export function openReportInNewTab(html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
}

export function downloadReport(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Renders the report HTML and saves it as an actual .pdf file (no browser
// print dialog). html2pdf.js wraps html2canvas + jsPDF.
//
// html2canvas snapshots real on-screen layout, so the render target must sit
// at normal (non-negative) coordinates with full opacity — an offscreen
// `left:-10000px` trick produces a blank capture. Instead we show the report
// in a fixed full-screen overlay (on top of everything, positive coords)
// while it's captured, then remove it once the PDF is saved.
export async function downloadReportPdf(html: string, filename: string) {
  const html2pdf = (await import("html2pdf.js")).default;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const sheet = doc.querySelector(".sheet");
  if (!sheet) throw new Error("Report HTML missing .sheet root");

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#f4f6f5;overflow:auto;padding:20px 0;";
  const container = document.createElement("div");
  container.style.cssText = "width:860px;max-width:100%;margin:0 auto;background:#f4f6f5;";
  const styleEl = doc.querySelector("style");
  if (styleEl) container.appendChild(styleEl.cloneNode(true));
  container.appendChild(sheet.cloneNode(true));
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // Wait for layout/paint so html2canvas doesn't snapshot before styles apply.
  // (A double-rAF wait was tried first but resolved before the browser
  // actually painted, producing a zero-height capture; a fixed delay is
  // reliable here.)
  await new Promise((resolve) => setTimeout(resolve, 50));

  try {
    await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#f4f6f5" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(container)
      .save();
  } finally {
    overlay.remove();
  }
}

// Sheet names in Excel can't contain \ / ? * [ ] : and are capped at 31 chars.
function sheetName(title: string, fallback: string): string {
  const cleaned = title.replace(/[\\/?*[\]:]/g, "").trim();
  return (cleaned || fallback).slice(0, 31);
}

function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

const XL_ACCENT = argb(ACCENT);
const XL_ACCENT_TINT = "FFE6F5EF"; // light accent tint for sub-headers
const XL_ZEBRA = argb("#f8faf9");
const XL_BORDER = argb("#e6ebe8");
const XL_INK = argb(INK);
const XL_MUTED = argb(MUTED);
const XL_WHITE = argb(SURFACE);

const thinBorder = {
  top: { style: "thin" as const, color: { argb: XL_BORDER } },
  left: { style: "thin" as const, color: { argb: XL_BORDER } },
  bottom: { style: "thin" as const, color: { argb: XL_BORDER } },
  right: { style: "thin" as const, color: { argb: XL_BORDER } },
};

export async function downloadReportExcel(doc: ReportDoc, filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = doc.title;
  wb.created = new Date();

  const summary = wb.addWorksheet(sheetName(doc.title, "Summary"));
  summary.mergeCells("A1:C1");
  const titleRow = summary.getRow(1);
  titleRow.getCell(1).value = doc.title;
  titleRow.height = 26;
  titleRow.eachCell((cell) => {
    cell.font = { bold: true, size: 15, color: { argb: XL_WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_ACCENT } };
    cell.alignment = { vertical: "middle" };
  });

  const metaRow = summary.addRow([doc.portfolioName, doc.periodLabel]);
  metaRow.font = { italic: true, color: { argb: XL_MUTED } };
  const genRow = summary.addRow([doc.generatedLabel]);
  genRow.font = { italic: true, size: 10, color: { argb: XL_MUTED } };
  summary.addRow([]);

  const kpiHeader = summary.addRow(["KPI", "Value"]);
  kpiHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: XL_INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_ACCENT_TINT } };
    cell.border = thinBorder;
  });
  doc.kpis.forEach((k) => {
    const row = summary.addRow([k.label, k.sub ? `${k.value} ${k.sub}` : k.value]);
    row.getCell(1).font = { color: { argb: XL_MUTED } };
    row.getCell(2).font = {
      bold: true,
      color: { argb: k.color ? argb(k.color) : XL_INK },
    };
    row.eachCell((cell) => (cell.border = thinBorder));
  });

  if (doc.allocation.length) {
    summary.addRow([]);
    const allocTitleRow = summary.addRow([doc.allocationTitle]);
    allocTitleRow.font = { bold: true, color: { argb: XL_INK } };
    const allocHeader = summary.addRow(["สินทรัพย์", "%", "มูลค่า"]);
    allocHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: XL_INK } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_ACCENT_TINT } };
      cell.border = thinBorder;
    });
    doc.allocation.forEach((a) => {
      const row = summary.addRow([`  ${a.name}`, `${a.pct.toFixed(1)}%`, a.valueText]);
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(a.color) } };
      row.getCell(1).font = { color: { argb: XL_WHITE }, bold: true };
      row.getCell(2).alignment = { horizontal: "right" };
      row.getCell(3).alignment = { horizontal: "right" };
      row.eachCell((cell) => (cell.border = thinBorder));
    });
  }
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 18;
  summary.getColumn(3).width = 18;
  summary.views = [{ state: "frozen", ySplit: 1 }];

  doc.tables.forEach((tb, i) => {
    const ws = wb.addWorksheet(sheetName(tb.title, `Table ${i + 1}`));
    const right = new Set(tb.alignRight ?? []);

    const headerRow = ws.addRow(tb.headers);
    headerRow.height = 20;
    headerRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, color: { argb: XL_WHITE } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_ACCENT } };
      cell.alignment = { horizontal: right.has(colNum - 1) ? "right" : "left", vertical: "middle" };
      cell.border = thinBorder;
    });

    if (!tb.rows.length) {
      const emptyRow = ws.addRow([tb.emptyText]);
      ws.mergeCells(emptyRow.number, 1, emptyRow.number, tb.headers.length);
      emptyRow.getCell(1).font = { italic: true, color: { argb: XL_MUTED } };
      emptyRow.getCell(1).alignment = { horizontal: "center" };
    } else {
      tb.rows.forEach((rowData, r) => {
        const row = ws.addRow(rowData);
        row.eachCell((cell, colNum) => {
          const idx = colNum - 1;
          cell.border = thinBorder;
          cell.alignment = { horizontal: right.has(idx) ? "right" : "left" };
          if (r % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_ZEBRA } };
          }
          const color = tb.colors?.[r]?.[idx];
          if (color) cell.font = { bold: true, color: { argb: argb(color) } };
        });
      });
    }

    ws.columns.forEach((col, idx) => {
      col.width = idx === 0 ? 16 : 14;
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
