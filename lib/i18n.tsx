"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { getUserProfile, updateUserProfile } from "@/lib/firestore";

export type Language = "th" | "en";

const DICTIONARY: Record<string, Record<Language, string>> = {
  // Bottom nav
  "nav.dashboard": { th: "Dashboard", en: "Dashboard" },
  "nav.portfolio": { th: "Portfolio", en: "Portfolio" },
  "nav.transaction": { th: "Transaction", en: "Transaction" },
  "nav.earn": { th: "Earn", en: "Earn" },
  "nav.more": { th: "More", en: "More" },
  "nav.moreSheetTitle": { th: "เมนูเพิ่มเติม", en: "More menu" },
  "nav.plan": { th: "แผนลงทุน (DCA)", en: "Invest plan" },
  "nav.analysis": { th: "วิเคราะห์", en: "Analysis" },
  "nav.portfolios": { th: "แยกพอร์ต", en: "Split portfolios" },
  "nav.reports": { th: "รายงาน (Reports)", en: "Reports" },
  "nav.settings": { th: "ตั้งค่า (Settings)", en: "Settings" },

  // Technical analysis
  "analysis.title": { th: "วิเคราะห์", en: "Analysis" },
  "analysis.symbolLabel": { th: "สินทรัพย์ (หุ้น / คริปโต)", en: "Asset (stock / crypto)" },
  "analysis.customSymbol": { th: "กรอกสัญลักษณ์เอง…", en: "Custom symbol…" },
  "analysis.customPlaceholder": { th: "สัญลักษณ์ เช่น BTC, AAPL, PTT", en: "Symbol e.g. BTC, AAPL, PTT" },
  "analysis.sourceCrypto": { th: "คริปโต", en: "Crypto" },
  "analysis.sourceUs": { th: "หุ้นนอก", en: "US stock" },
  "analysis.sourceTh": { th: "หุ้นไทย", en: "Thai stock" },
  "analysis.loading": { th: "กำลังโหลดข้อมูลกราฟ...", en: "Loading chart data..." },
  "analysis.noData": {
    th: "ไม่พบข้อมูลของสัญลักษณ์นี้ อาจเป็นเพราะสัญลักษณ์ไม่ถูกต้อง หรือแหล่งข้อมูลขัดข้องชั่วคราว",
    en: "No data found for this symbol — either the symbol is wrong, or the data source hiccuped momentarily.",
  },
  "analysis.retry": { th: "ลองอีกครั้ง", en: "Retry" },
  "analysis.price": { th: "ราคาปัจจุบัน", en: "Current price" },
  "analysis.breakout": { th: "Breakout ทะลุแนวต้าน!", en: "Breakout above resistance!" },
  "analysis.breakdown": { th: "Breakdown หลุดแนวรับ!", en: "Breakdown below support!" },
  "analysis.inRange": { th: "อยู่ในกรอบ", en: "In range" },
  "analysis.levelsTitle": { th: "แนวรับ / แนวต้าน", en: "Support / Resistance" },
  "analysis.resistance": { th: "แนวต้าน", en: "Resistance" },
  "analysis.support": { th: "แนวรับ", en: "Support" },
  "analysis.breakAlertBtn": {
    th: "ตั้งเตือน Breakout / Breakdown อัตโนมัติ",
    en: "Auto-alert on Breakout / Breakdown",
  },
  "analysis.pivotTitle": { th: "Pivot Points (คำนวณอัตโนมัติ)", en: "Pivot Points (auto)" },
  "analysis.fibTitle": { th: "Fibonacci Retracement", en: "Fibonacci Retracement" },
  "analysis.trendTitle": { th: "แนวโน้ม", en: "Trend" },
  "analysis.trendUp": { th: "ขาขึ้น", en: "Uptrend" },
  "analysis.trendDown": { th: "ขาลง", en: "Downtrend" },
  "analysis.trendSide": { th: "ไซด์เวย์", en: "Sideways" },
  "analysis.indicatorsTitle": { th: "อินดิเคเตอร์", en: "Indicators" },
  "analysis.overbought": { th: "ซื้อมากเกิน", en: "Overbought" },
  "analysis.oversold": { th: "ขายมากเกิน", en: "Oversold" },
  "analysis.neutralZone": { th: "โซนกลาง", en: "Neutral" },
  "analysis.bullish": { th: "กระทิง (Bullish)", en: "Bullish" },
  "analysis.bearish": { th: "หมี (Bearish)", en: "Bearish" },
  "analysis.mtfTitle": { th: "วิเคราะห์หลาย Timeframe", en: "Multi-timeframe view" },
  "analysis.alertsTitle": { th: "การแจ้งเตือนราคา (LINE)", en: "Price alerts (LINE)" },
  "analysis.alertNote": {
    th: "แตะกระดิ่งที่ระดับราคาเพื่อตั้งเตือน · ระบบเช็คให้ตลอด 24 ชม. แม้ปิดแอปอยู่ (ทุก 5 นาทีผ่านเซิร์ฟเวอร์ + ทุก 1 นาทีขณะเปิดแอป) · เตือนซ้ำระดับเดิมได้ทุก 6 ชั่วโมง",
    en: "Tap a bell next to any level to set an alert · checked 24/7 even with the app closed (every 5 min server-side + every minute while the app is open) · the same level re-alerts at most every 6 hours",
  },
  "analysis.noAlerts": {
    th: "ยังไม่มีการแจ้งเตือน",
    en: "No alerts yet",
  },
  "analysis.lineNotConfigured": {
    th: "⚙️ ยังไม่ได้ตั้งค่า LINE — แตะเพื่อไปใส่ Channel Token และ User ID ในหน้าตั้งค่า",
    en: "⚙️ LINE not configured — tap to add your Channel Token and User ID in Settings",
  },
  "analysis.fired": { th: "แจ้งแล้ว", en: "fired" },

  // Reports
  "report.title": { th: "รายงานพอร์ตการลงทุน", en: "Portfolio Report" },
  "report.portfolio": { th: "พอร์ตหลัก", en: "Main portfolio" },
  "report.periodMonth": { th: "เดือนนี้", en: "This month" },
  "report.periodYear": { th: "ปีนี้", en: "This year" },
  "report.periodAll": { th: "ทั้งหมด", en: "All time" },
  "report.generatedAt": { th: "สร้างเมื่อ", en: "Generated" },
  "report.kpiValue": { th: "มูลค่าพอร์ตรวม", en: "Total value" },
  "report.kpiCost": { th: "เงินลงทุน", en: "Invested" },
  "report.kpiPnl": { th: "กำไร/ขาดทุน", en: "P/L" },
  "report.kpiDividends": { th: "เงินปันผลช่วงนี้", en: "Dividends (period)" },
  "report.kpiEarnInterest": { th: "ดอกเบี้ย Earn สะสม", en: "Earn interest" },
  "report.allocation": { th: "สัดส่วนสินทรัพย์ (Asset Allocation)", en: "Asset Allocation" },
  "report.holdingsTitle": { th: "สินทรัพย์ที่ถือ", en: "Holdings" },
  "report.txTitle": { th: "ธุรกรรม", en: "Transactions" },
  "report.divTitle": { th: "เงินปันผล", en: "Dividends" },
  "report.earnTitle": { th: "Crypto Earn", en: "Crypto Earn" },
  "report.buys": { th: "ซื้อ", en: "buys" },
  "report.sells": { th: "ขาย", en: "sells" },
  "report.colSymbol": { th: "สัญลักษณ์", en: "Symbol" },
  "report.colClass": { th: "ประเภท", en: "Class" },
  "report.colQty": { th: "จำนวน", en: "Qty" },
  "report.colCost": { th: "ต้นทุน/หน่วย", en: "Cost/unit" },
  "report.colValue": { th: "มูลค่า", en: "Value" },
  "report.colPnl": { th: "กำไร/ขาดทุน", en: "P/L" },
  "report.colDate": { th: "วันที่", en: "Date" },
  "report.colType": { th: "ประเภท", en: "Type" },
  "report.colPrice": { th: "ราคา", en: "Price" },
  "report.colTotal": { th: "รวม", en: "Total" },
  "report.colInterest": { th: "ดอกเบี้ยสะสม", en: "Interest" },
  "report.none": { th: "ไม่มีรายการในช่วงนี้", en: "Nothing in this period" },
  "report.contents": { th: "รายงานจะประกอบด้วย", en: "This report includes" },
  "report.items": { th: "รายการ", en: "items" },
  "report.exportOpen": { th: "เปิดรายงาน / พิมพ์เป็น PDF", en: "Open report / print to PDF" },
  "report.exportDownload": { th: "ดาวน์โหลดไฟล์รายงาน (HTML)", en: "Download report file (HTML)" },
  "report.exportHint": {
    th: "รายงานที่ส่งออกจัดรูปแบบพร้อมสีครบถ้วน เปิดได้ทุกเครื่อง · กด เปิดรายงาน แล้วสั่งพิมพ์เพื่อบันทึกเป็น PDF",
    en: "Exports are fully styled with colors and open anywhere · use Open report then print to save as PDF",
  },
  "report.footer": {
    th: "สร้างจากแอปพอร์ตการลงทุน · ราคา ณ เวลาที่สร้างรายงาน อาจต่างจากราคาปัจจุบัน",
    en: "Generated by the portfolio app · prices are as of generation time and may differ from current prices",
  },

  // Yearly investment plan (DCA)
  "plan.title": { th: "แผนลงทุน", en: "Invest plan" },
  "plan.belowBudget": {
    th: "ลงทุนปี {year} ยังต่ำกว่าทุนอีก {amount}",
    en: "{year} investing is still {amount} below budget",
  },
  "plan.metBudget": {
    th: "ลงทุนปี {year} ครบทุนแล้ว 🎉",
    en: "{year} budget fully invested 🎉",
  },
  "plan.budgetThisYear": { th: "ทุนปีนี้", en: "This year's budget" },
  "plan.notSavedYet": { th: "ยังไม่ได้บันทึกปีนี้", en: "Not saved for this year yet" },
  "plan.savedInfo": { th: "บันทึกแผนแล้ว", en: "Plan saved" },
  "plan.save": { th: "บันทึกแผนปีนี้", en: "Save this year's plan" },
  "plan.saving": { th: "กำลังบันทึก...", en: "Saving..." },
  "plan.yearLabel": { th: "ปี (พ.ศ.)", en: "Year (BE)" },
  "plan.budgetLabel": { th: "ทุนปีนี้ (บาท)", en: "Budget (THB)" },
  "plan.investedNow": { th: "ตอนนี้", en: "so far" },
  "plan.buyableNow": { th: "ซื้อได้ตอนนี้", en: "Can buy now" },
  "plan.overPlan": { th: "เกินแผนแล้ว", en: "Over plan by" },
  "plan.done": { th: "ครบแผนแล้ว", en: "Plan met" },
  "plan.removeFromPlan": { th: "ลบออกจากแผน", en: "Remove from plan" },
  "plan.addToPlan": { th: "+ เพิ่ม", en: "+ Add" },
  "plan.addPlaceholder": { th: "เพิ่มสินทรัพย์เข้าแผน", en: "Add an asset to the plan" },
  "plan.pctTotal": { th: "รวมสัดส่วน {pct}%", en: "Total allocation {pct}%" },
  "plan.empty": {
    th: "ยังไม่มีสินทรัพย์ในแผน เลือกจากรายการด้านบนเพื่อเริ่มวางแผน",
    en: "No assets in the plan yet. Pick one above to start planning.",
  },

  // Common
  "common.loading": { th: "กำลังโหลด...", en: "Loading..." },
  "common.save": { th: "บันทึก", en: "Save" },
  "common.saving": { th: "กำลังบันทึก...", en: "Saving..." },
  "common.cancel": { th: "ยกเลิก", en: "Cancel" },
  "common.delete": { th: "ลบ", en: "Delete" },
  "common.edit": { th: "แก้ไข", en: "Edit" },
  "common.add": { th: "เพิ่ม", en: "Add" },
  "common.comingSoon": { th: "เร็วๆ นี้", en: "Coming soon" },
  "common.saveChanges": { th: "บันทึกการแก้ไข", en: "Save changes" },
  "common.previous": { th: "ก่อนหน้า", en: "Previous" },
  "common.next": { th: "ถัดไป", en: "Next" },
  "common.pageIndicator": { th: "หน้า {page} จาก {total}", en: "Page {page} of {total}" },

  // Dashboard
  "dashboard.title": { th: "Dashboard", en: "Dashboard" },
  "dashboard.totalValue": { th: "มูลค่าพอร์ตทั้งหมด", en: "Total portfolio value" },
  "dashboard.pnl": { th: "กำไรขาดทุน", en: "Profit/Loss" },
  "dashboard.returnPct": { th: "ผลตอบแทน %", en: "Return %" },
  "dashboard.allTime": { th: "(All Time)", en: "(All Time)" },
  "dashboard.invested": { th: "เงินลงทุน", en: "Invested" },
  "dashboard.allocation": { th: "Asset Allocation", en: "Asset Allocation" },
  "dashboard.total": { th: "Total", en: "Total" },
  "dashboard.selectPortfolio": { th: "พอร์ตหลัก", en: "Main portfolio" },
  "dashboard.noAssets": {
    th: "ยังไม่มีสินทรัพย์ — ไปที่หน้า Portfolio เพื่อเพิ่มรายการ",
    en: "No assets yet — go to Portfolio to add one",
  },
  "chart.needsMoreDays": {
    th: "ยังไม่มีข้อมูลกราฟ",
    en: "No chart data yet",
  },
  "dashboard.chartEmpty": {
    th: "เพิ่มสินทรัพย์เพื่อดูกราฟมูลค่าพอร์ตย้อนหลัง",
    en: "Add assets to see the portfolio value history",
  },

  // Portfolio
  "portfolio.title": { th: "Portfolio", en: "Portfolio" },
  "portfolio.totalValue": { th: "มูลค่ารวม", en: "Total value" },
  "portfolio.empty": {
    th: "ยังไม่มีสินทรัพย์ในพอร์ต กดปุ่ม + เพื่อเพิ่มรายการแรก",
    en: "No assets in this portfolio yet. Tap + to add your first one.",
  },
  "portfolio.units": { th: "หน่วย", en: "units" },
  "portfolio.costBasis": { th: "ต้นทุน/หน่วย", en: "Cost/unit" },
  "portfolio.addTitle": { th: "เพิ่มสินทรัพย์", en: "Add asset" },
  "portfolio.editTitle": { th: "แก้ไขสินทรัพย์", en: "Edit asset" },
  "portfolio.symbol": { th: "สัญลักษณ์ (เช่น PTT, AAPL, BTC)", en: "Symbol (e.g. PTT, AAPL, BTC)" },
  "portfolio.assetClass": { th: "ประเภทสินทรัพย์", en: "Asset class" },
  "portfolio.unassignedTitle": { th: "สินทรัพย์ที่ยังไม่ได้จัดพอร์ต", en: "Unassigned assets" },
  "portfolio.pickFromUnassigned": { th: "เลือกจากสินทรัพย์ที่ถืออยู่", en: "Choose from your holdings" },
  "portfolio.live": { th: "สด", en: "Live" },
  "portfolio.addNewTitle": { th: "เพิ่มสินทรัพย์ใหม่", en: "Add new asset" },
  "portfolio.editHelp": {
    th: "แก้ไขประเภทได้ หากตอนแรกเลือกผิด (เช่น หุ้นต่างประเทศถูกเลือกเป็นหุ้นไทย)",
    en: "You can change the asset class if it was picked wrong at first (e.g. a foreign stock marked as a Thai stock).",
  },
  "portfolio.addHelp": {
    th: "เพิ่มชื่อสินทรัพย์ก่อน แล้วไปบันทึกจำนวน/ต้นทุนที่หน้า Transaction",
    en: "Add the asset name first, then record quantity/cost on the Transaction page.",
  },
  "portfolio.typeLabel": { th: "ประเภท", en: "Type" },
  "portfolio.tickerHint": { th: "เช่น AAPL, BTC, PTT", en: "e.g. AAPL, BTC, PTT" },
  "portfolio.symbolConflict": {
    th: '{symbol} อยู่ในพอร์ต "{portfolioName}" อยู่แล้ว ต้องลบออกจากพอร์ตนั้นก่อนถึงจะเพิ่มที่นี่ได้',
    en: '{symbol} is already in the "{portfolioName}" portfolio. Remove it from there first before adding it here.',
  },
  "portfolio.anotherPortfolio": { th: "พอร์ตอื่น", en: "another portfolio" },
  "portfolio.addSubmit": { th: "+ เพิ่มสินทรัพย์", en: "+ Add asset" },
  "picker.chooseFromRemoved": {
    th: "เลือกจากสินทรัพย์ที่ถอดออกจากพอร์ตอื่นแล้ว",
    en: "Choose from assets removed from another portfolio",
  },
  "picker.orTypeNewTicker": {
    th: "หรือพิมพ์ Ticker ใหม่ด้านล่างสำหรับสินทรัพย์ที่ยังไม่เคยเพิ่ม",
    en: "Or type a new ticker below for an asset you haven't added yet",
  },

  // Portfolios (split portfolios)
  "portfolios.title": { th: "แยกพอร์ต", en: "Portfolios" },
  "portfolios.addPortfolio": { th: "เพิ่มพอร์ตใหม่", en: "Add new portfolio" },
  "portfolios.namePlaceholder": { th: "ชื่อพอร์ต", en: "Portfolio name" },
  "portfolios.target": { th: "เป้าหมายพอร์ต (บาท)", en: "Portfolio target (THB)" },
  "portfolios.noTarget": { th: "ยังไม่ได้ตั้งเป้าหมาย", en: "No target set" },
  "portfolios.progress": { th: "ความคืบหน้า", en: "Progress" },
  "portfolios.assets": { th: "สินทรัพย์", en: "Assets" },
  "portfolios.addAsset": { th: "เพิ่มสินทรัพย์", en: "Add asset" },
  "portfolios.removeConfirm": {
    th: "ลบพอร์ตนี้? สินทรัพย์ในพอร์ตจะกลายเป็นยังไม่ได้จัดพอร์ต",
    en: "Delete this portfolio? Its assets will become unassigned.",
  },
  "portfolios.needAtLeastOne": { th: "ต้องมีอย่างน้อย 1 พอร์ต", en: "You need at least 1 portfolio" },
  "portfolios.hint": {
    th: "แตะชื่อพอร์ตเพื่อสลับพอร์ตที่ใช้งานอยู่ · แตะไอคอนลูกศรเพื่อเพิ่ม/ลบสินทรัพย์และตั้งเป้าหมาย",
    en: "Tap a portfolio name to switch to it · tap the arrow icon to add/remove assets and set a target",
  },
  "portfolios.deleteHasAssets": {
    th: "ลบพอร์ตนี้ไม่ได้ ยังมีสินทรัพย์อยู่ ย้ายหรือลบสินทรัพย์ทั้งหมดก่อน",
    en: "Can't delete this portfolio — it still has assets. Move or remove them all first.",
  },
  "portfolios.deleteFailed": { th: "ลบไม่สำเร็จ", en: "Delete failed" },
  "portfolios.active": { th: "กำลังใช้", en: "Active" },
  "portfolios.assetsCountLabel": { th: "{count} สินทรัพย์", en: "{count} assets" },
  "portfolios.targetPrefix": { th: "เป้าหมาย", en: "Target" },
  "portfolios.emptyAssets": { th: "ยังไม่มีสินทรัพย์ในพอร์ตนี้", en: "No assets in this portfolio yet" },
  "portfolios.removeFromPortfolioTitle": { th: "เอาออกจากพอร์ต", en: "Remove from portfolio" },
  "portfolios.addAssetHere": { th: "+ เพิ่มสินทรัพย์ในพอร์ตนี้", en: "+ Add asset to this portfolio" },
  "portfolios.createTitle": { th: "สร้างพอร์ตใหม่", en: "Create new portfolio" },
  "portfolios.namePlaceholderExample": { th: "เช่น พอร์ตเกษียณ", en: "e.g. Retirement portfolio" },
  "portfolios.createSubmit": { th: "สร้างพอร์ต", en: "Create portfolio" },
  "portfolios.targetModalTitle": { th: "ตั้งเป้าหมายพอร์ต", en: "Set portfolio target" },
  "portfolios.targetAmountLabel": { th: "เป้าหมาย (บาท)", en: "Target (THB)" },
  "portfolios.targetHelp": {
    th: "เว้นว่างหรือใส่ 0 เพื่อไม่แสดงหลอดความคืบหน้า",
    en: "Leave blank or enter 0 to hide the progress bar",
  },
  "portfolios.targetSubmit": { th: "บันทึกเป้าหมาย", en: "Save target" },
  "portfolios.addAssetModalTitle": { th: "เพิ่มสินทรัพย์ในพอร์ต", en: "Add asset to portfolio" },

  // Transactions
  "transactions.title": { th: "Transaction", en: "Transactions" },
  "transactions.all": { th: "ทั้งหมด", en: "All" },
  "transactions.buy": { th: "ซื้อ", en: "Buy" },
  "transactions.sell": { th: "ขาย", en: "Sell" },
  "transactions.dividend": { th: "ปันผล", en: "Dividend" },
  "transactions.earn": { th: "Earn", en: "Earn" },
  "transactions.empty": { th: "ไม่มีรายการธุรกรรม", en: "No transactions" },
  "transactions.addTitle": { th: "เพิ่มธุรกรรม", en: "Add transaction" },
  "transactions.editTitle": { th: "แก้ไขธุรกรรม", en: "Edit transaction" },
  "transactions.emptyEarn": {
    th: "ยังไม่มีประวัติ Earn — ไปที่หน้า Earn เพื่อเริ่มเพิ่มรายการ",
    en: "No Earn history yet — go to the Earn page to add your first position",
  },
  "transactions.startedEarn": { th: "เริ่ม Earn", en: "Started Earn" },
  "transactions.deposited": { th: "ฝาก", en: "deposited" },
  "transactions.dailyInterestTitle": { th: "ดอกเบี้ยรายวัน (จ่ายเป็น {symbol})", en: "Daily interest (paid in {symbol})" },
  "transactions.noInterestDays": {
    th: "ยังไม่มีวันที่คำนวณดอกเบี้ยได้",
    en: "No days with calculable interest yet",
  },
  "transactions.emptyList": {
    th: "ยังไม่มีธุรกรรม กดปุ่ม + เพื่อเพิ่มรายการแรก",
    en: "No transactions yet. Tap + to add your first one.",
  },
  "transactions.units": { th: "หน่วย", en: "units" },
  "transactions.dateLabel": { th: "วันที่", en: "Date" },
  "transactions.typeLabel": { th: "ประเภทธุรกรรม", en: "Transaction type" },
  "transactions.symbolLabel": { th: "สัญลักษณ์ (Symbol)", en: "Symbol" },
  "transactions.assetClassForNew": {
    th: "ประเภทสินทรัพย์ (สำหรับสินทรัพย์ใหม่)",
    en: "Asset class (for a new asset)",
  },
  "transactions.quantityLabel": { th: "จำนวนหน่วย", en: "Quantity" },
  "transactions.currencyLabel": { th: "สกุลเงิน", en: "Currency" },
  "transactions.avgCostLabel": { th: "ต้นทุนเฉลี่ย ({currency})", en: "Average cost ({currency})" },
  "transactions.notesLabel": { th: "หมายเหตุ (ไม่บังคับ)", en: "Notes (optional)" },
  "transactions.saveTransaction": { th: "บันทึกธุรกรรม", en: "Save transaction" },

  // Earn
  "earn.title": { th: "Crypto Earn", en: "Crypto Earn" },
  "earn.totalValue": { th: "มูลค่ารวมใน Earn", en: "Total Earn value" },
  "earn.empty": {
    th: "เพิ่มรายการใน Earn เพื่อดูกราฟดอกเบี้ยทบต้น",
    en: "Add an Earn position to see the compounding chart",
  },
  "earn.listTitle": { th: "รายการ Earn", en: "Earn positions" },
  "earn.listEmpty": {
    th: "ยังไม่มีรายการใน Earn กดปุ่ม + เพื่อเพิ่มรายการแรก",
    en: "No Earn positions yet. Tap + to add your first one.",
  },
  "earn.addTitle": { th: "เพิ่มสินทรัพย์ใน Earn", en: "Add an Earn asset" },
  "earn.symbol": { th: "สัญลักษณ์ (เช่น USDT, BTC, ETH)", en: "Symbol (e.g. USDT, BTC, ETH)" },
  "earn.apy": { th: "APY (%)", en: "APY (%)" },
  "earn.quantity": { th: "จำนวนเหรียญ", en: "Coin quantity" },
  "earn.startingQuantity": { th: "จำนวนเหรียญตั้งต้น", en: "Starting coin quantity" },
  "earn.currentQuantity": { th: "จำนวนเหรียญปัจจุบัน", en: "Current coin balance" },
  "earn.costBasisPrice": { th: "ราคาต้นทุน (บาท/เหรียญ)", en: "Cost basis (THB/coin)" },
  "earn.startDate": { th: "วันที่เริ่ม", en: "Start date" },
  "earn.effectiveDate": { th: "มีผลตั้งแต่วันที่", en: "Effective from" },
  "earn.addSubmit": { th: "เพิ่มสินทรัพย์ใน Earn", en: "Add to Earn" },
  "earn.editTitle": { th: "แก้ไข", en: "Edit" },
  "earn.editSubmit": { th: "บันทึกการแก้ไข", en: "Save changes" },
  "earn.addHelp": {
    th: "ดอกเบี้ยจ่ายเป็นเหรียญเดียวกันและทบต้นรายวันตาม APY จำนวนเหรียญจะเพิ่มขึ้นเรื่อยๆ ส่วนมูลค่าบาทจะขึ้นกับราคาตลาดปัจจุบันของเหรียญนั้นด้วย (ราคาต้นทุนใช้ราคา ณ ตอนบันทึก ไม่รองรับราคาย้อนหลัง)",
    en: "Interest is paid in the same coin and compounds daily by APY, so the coin quantity keeps growing. The THB value also depends on that coin's current market price (cost basis uses the price at save time — historical prices aren't supported).",
  },
  "earn.editHelp": {
    th: "ค่าที่แก้ไขจะมีผลตั้งแต่วันที่เลือกเป็นต้นไปเท่านั้น ดอกเบี้ยที่สะสมมาก่อนหน้าจะถูกเก็บไว้ ไม่ถูกคำนวณใหม่ย้อนหลัง",
    en: "Edited values apply from the chosen date forward only. Interest accrued before then is kept, not recalculated retroactively.",
  },
  "earn.combined": { th: "รวม", en: "combined" },
  "earn.entries": { th: "รายการ", en: "entries" },
  "earn.startedOn": { th: "เริ่ม", en: "started" },
  "earn.priceNotFound": {
    th: "ไม่พบราคาตลาดของ {symbol} กรุณาตรวจสอบสัญลักษณ์อีกครั้ง",
    en: "No market price found for {symbol}. Please double-check the symbol.",
  },
  "earn.invalidCostBasis": {
    th: "ราคาต้นทุนต้องมากกว่า 0 ไม่เช่นนั้นจะคำนวณมูลค่าเป็นเงินบาทไม่ได้",
    en: "Cost basis must be greater than 0, or the THB value can't be calculated.",
  },

  // Dividends
  "dividends.title": { th: "เงินปันผล", en: "Dividends" },
  "dividends.empty": { th: "ยังไม่มีรายการเงินปันผล", en: "No dividends yet" },
  "dividends.emptyHistory": { th: "ยังไม่มีประวัติเงินปันผล", en: "No dividend history yet" },
  "dividends.addTitle": { th: "เพิ่มเงินปันผล", en: "Add dividend" },
  "dividends.ytd": { th: "รวมปีนี้ (YTD)", en: "Total this year (YTD)" },
  "dividends.saveModalTitle": { th: "บันทึกเงินปันผล", en: "Record dividend" },
  "dividends.symbolLabel": { th: "สัญลักษณ์ (Symbol)", en: "Symbol" },
  "dividends.exDateLabel": { th: "วันขึ้นเครื่องหมาย (Ex-date)", en: "Ex-dividend date" },
  "dividends.paymentDateLabel": { th: "วันจ่ายเงินปันผล", en: "Payment date" },
  "dividends.exDateHelp": {
    th: "ใช้กำหนดจำนวนหน่วยที่ถือ ณ วันนั้น สำหรับคำนวณเงินปันผลรวม",
    en: "Used to determine the units held on that date, for computing the total payout",
  },
  "dividends.amountPerShareLabel": { th: "เงินปันผล/หน่วย", en: "Dividend per unit" },
  "dividends.symbolSelectPlaceholder": { th: "เลือกหุ้นที่ถืออยู่", en: "Select a stock you hold" },
  "dividends.computedTotal": {
    th: "คำนวณจาก {quantity} หน่วยที่ถือ ณ วันที่กำหนด = {amount}",
    en: "Calculated from {quantity} units held as of that date = {amount}",
  },
  "dividends.noHoldings": {
    th: "ยังไม่มีหุ้นถืออยู่ในพอร์ต — ไปที่หน้า Portfolio เพื่อเพิ่มก่อน",
    en: "No stocks held yet — add one on the Portfolio page first",
  },
  "dividends.autoSyncNote": {
    th: "หุ้นต่างประเทศ/ETF จะดึงประวัติเงินปันผลจากอินเทอร์เน็ตอัตโนมัติ หากมีการเปลี่ยนแปลงจะอัปเดตให้เอง ส่วนหุ้นไทยต้องเพิ่มเอง (ยังไม่มีแหล่งข้อมูลฟรี)",
    en: "Foreign stocks/ETFs auto-sync their dividend history from the internet and update automatically if it changes. Thai stocks still need manual entry (no free data source yet).",
  },
  "dividends.save": { th: "บันทึก", en: "Save" },
  "dividends.monthJan": { th: "ม.ค.", en: "Jan" },
  "dividends.monthFeb": { th: "ก.พ.", en: "Feb" },
  "dividends.monthMar": { th: "มี.ค.", en: "Mar" },
  "dividends.monthApr": { th: "เม.ย.", en: "Apr" },
  "dividends.monthMay": { th: "พ.ค.", en: "May" },
  "dividends.monthJun": { th: "มิ.ย.", en: "Jun" },
  "dividends.monthJul": { th: "ก.ค.", en: "Jul" },
  "dividends.monthAug": { th: "ส.ค.", en: "Aug" },
  "dividends.monthSep": { th: "ก.ย.", en: "Sep" },
  "dividends.monthOct": { th: "ต.ค.", en: "Oct" },
  "dividends.monthNov": { th: "พ.ย.", en: "Nov" },
  "dividends.monthDec": { th: "ธ.ค.", en: "Dec" },

  // Reports (placeholder)
  "reports.title": { th: "รายงาน", en: "Reports" },
  "reports.comingSoonMessage": {
    th: "ฟีเจอร์นี้กำลังพัฒนา เร็ว ๆ นี้",
    en: "This feature is coming soon",
  },

  // Settings
  "settings.title": { th: "Settings", en: "Settings" },
  "settings.language": { th: "ภาษา", en: "Language" },
  "settings.languageThai": { th: "ไทย", en: "Thai" },
  "settings.languageEnglish": { th: "English", en: "English" },
  "settings.theme": { th: "ธีม", en: "Theme" },
  "settings.themeDark": { th: "เข้ม", en: "Dark" },
  "settings.themeLight": { th: "อ่อน", en: "Light" },
  "settings.themeSystem": { th: "ระบบ", en: "System" },
  "settings.currency": { th: "สกุลเงิน", en: "Currency" },
  "settings.currencyThb": { th: "บาท", en: "THB" },
  "settings.currencyUsd": { th: "USD", en: "USD" },
  "settings.logout": { th: "ออกจากระบบ", en: "Log out" },
  "settings.lineTitle": { th: "แจ้งเตือนผ่าน LINE", en: "LINE notifications" },
  "settings.lineHelp": {
    th: "สร้าง LINE Official Account แล้วเปิดใช้ Messaging API จากนั้นนำ Channel Access Token และ User ID ของคุณ (ดูได้จากหน้า Basic settings ของ LINE Developers) มาใส่ เพื่อให้ระบบส่งแจ้งเตือนราคาเข้า LINE ได้",
    en: "Create a LINE Official Account with the Messaging API enabled, then paste your Channel Access Token and your User ID (from the LINE Developers Basic settings page) so price alerts can be pushed to LINE.",
  },
  "settings.lineToken": { th: "Channel Access Token", en: "Channel Access Token" },
  "settings.lineUserId": { th: "LINE User ID (ขึ้นต้นด้วย U)", en: "LINE User ID (starts with U)" },
  "settings.lineSave": { th: "บันทึกการตั้งค่า LINE", en: "Save LINE settings" },
  "settings.lineSaved": { th: "บันทึกแล้ว ✓", en: "Saved ✓" },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>("th");

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then((profile) => {
      if (profile?.language === "en") setLanguageState("en");
    });
  }, [user]);

  const setLanguage = useCallback(
    (l: Language) => {
      setLanguageState(l);
      if (user) updateUserProfile(user.uid, { language: l });
    },
    [user]
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const entry = DICTIONARY[key];
      let text = entry ? entry[language] : key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
