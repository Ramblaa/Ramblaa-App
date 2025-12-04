/** =========================================================================
 *  Core utilities (headers, JSON lookups, normalization)
 *  ========================================================================= */

 const DEBUG_AI = true;
 const OPENAI_MODEL = 'gpt-5-mini-2025-08-07';

 function _dbg_(...args) {
  if (!DEBUG_AI) return;
  try {
    const msg = args.map(v => {
      if (v == null) return String(v);
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch(_) { return String(v); }
    }).join(' ');
    Logger.log(msg);
  } catch(_) {}
}

/** =========================================================
 * summarizeMessage → writes JSON to 'Summarized Request JSON'
 * and logs one row per action to 'd:summarisedLogs'.
 * - Input tab:  summarizeMessage   (E = 'Message' per your spec)
 * - Output col: 'Summarized Request JSON' (created if missing)
 * - Log tab:    d:summarisedLogs   (created if missing)
 * ========================================================= */
function processSummarizeMessage() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('summarizeMessage');
  if (!sh) throw new Error('Sheet "summarizeMessage" not found');

  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');

  // --- CI header map (summarizeMessage) ---
  const H = (function () {
    const row = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0] || [];
    const m = {}; row.forEach((v,i)=> m[String(v||'').trim().toLowerCase()] = i+1); return m;
  })();
  const pick = (...names) => { for (const n of names) { const c = H[String(n).toLowerCase()]; if (c) return c; } return null; };

  // Inputs
  const C_MSG   = pick('message') || 5;  // E
  const C_PHONE = pick('phone','from');
  const C_UUID1 = pick('message uuid','message id','uuid','sid','smsmessagesid') || 4; // D (single)
  const C_UUIDS = pick('uuids','message uuids','reference message uuids','message chain uuids'); // bundle list
  const C_HIST  = pick('historical messages (to & from)','historical messages','conversation history','on-going conversation','ongoing conversation','history') || 7; // G
  const C_PROP  = pick('property id','propertyid','prop id');
  const C_BOOK  = pick('booking id','reservation id','bookingid');

  // Output on summarizeMessage
  const C_JSON  = (function ensureCol(label){
    const headers = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0]||[];
    const idx = headers.findIndex(h => String(h||'').trim().toLowerCase() === label.toLowerCase());
    if (idx >= 0) return idx + 1;
    const c = sh.getLastColumn() + 1; sh.getRange(1,c).setValue(label); return c;
  })('Summarized Request JSON');

  // --- d:summarisedLogs headers (add Message Bundle UUID) ---
  const logSh = ss.getSheetByName('d:summarisedLogs') || ss.insertSheet('d:summarisedLogs');
  const HL = (function(){
    const want = [
      'Timestamp','Property Id','Booking Id','Message UUID','Phone',
      'Language','Tone','Sentiment','Action Title','Original Message',
      'Summary JSON','Summary UUID','Message Bundle UUID'
    ];
    const raw = logSh.getRange(1,1,1,Math.max(1, logSh.getLastColumn())).getValues()[0] || [];
    const have = raw.map(v => String(v||'').trim());

    // Ensure all wanted headers exist (append if missing)
    const m = {}; have.forEach((h,i)=> m[h.toLowerCase()] = i+1);
    want.forEach(h => { if (!m[h.toLowerCase()]) { const c=logSh.getLastColumn()+1; logSh.getRange(1,c).setValue(h); m[h.toLowerCase()]=c; } });

    const hdrNow = logSh.getRange(1,1,1,Math.max(1, logSh.getLastColumn())).getValues()[0] || [];
    const idx = {}; hdrNow.forEach((v,i)=> idx[String(v||'').trim().toLowerCase()] = i+1);
    const g = (h)=> idx[h.toLowerCase()];
    return {
      TS:g('Timestamp'), PID:g('Property Id'), BID:g('Booking Id'), UUID:g('Message UUID'), PHN:g('Phone'),
      LNG:g('Language'), TONE:g('Tone'), SENT:g('Sentiment'), ACT:g('Action Title'), MSG:g('Original Message'),
      JSN:g('Summary JSON'), SUID:g('Summary UUID'), BUNDLE:g('Message Bundle UUID')
    };
  })();

  // De‑dup set by Summary UUID
  const existingSUIDs = new Set();
  const logRows = Math.max(0, logSh.getLastRow() - 1);
  if (logRows && HL.SUID) {
    const vals = logSh.getRange(2, HL.SUID, logRows, 1).getValues();
    vals.forEach(r => { const v = String(r[0]||'').trim(); if (v) existingSUIDs.add(v); });
  }

  // Helper: deterministic IDs
  const digest = (s)=> Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
  const makeSummaryUUID = (obj) => 'SUM_' + digest(
    [obj.uuid||obj.phone||'', obj.propertyId||'', obj.bookingId||'', (obj.actionTitle||'').toLowerCase()].join('|')
  ).slice(0,22);
  const makeBundleUUID  = (obj) => {
    const ids = (obj.msgUUIDs||[]).map(s=>String(s).trim()).filter(Boolean).sort().join('|');
    return 'MB_' + digest([obj.propertyId||'', obj.bookingId||'', obj.phone||'', ids].join('||')).slice(0,22);
  };

  // --- Build fast index for d:messageLog (Message UUID → row) and ensure target col for bundle UUID ---
  const msgSh = ss.getSheetByName('d:messageLog');
  let C_MSG_UUID = null, C_MSG_BUNDLE = null;
  let msgIndex = new Map();
  if (msgSh) {
    // Header map (case-insensitive)
    const mhdr = msgSh.getRange(1,1,1,Math.max(1, msgSh.getLastColumn())).getValues()[0] || [];
    const M = {}; mhdr.forEach((h,i)=> M[String(h||'').trim().toLowerCase()] = i+1);
    C_MSG_UUID = M['message uuid'] || 1;

    // Try to use column O (15) if possible; else use existing header; else append
    const WANT_LABEL = 'Message Bundle UUID';
    const lastCol = msgSh.getLastColumn();
    const headerAtO = lastCol >= 15 ? String(msgSh.getRange(1,15).getValue()||'').trim() : '';
    if (M[WANT_LABEL.toLowerCase()]) {
      C_MSG_BUNDLE = M[WANT_LABEL.toLowerCase()];
    } else if (lastCol >= 15 && (!headerAtO || headerAtO.toLowerCase() === WANT_LABEL.toLowerCase())) {
      msgSh.getRange(1,15).setValue(WANT_LABEL);
      C_MSG_BUNDLE = 15;
    } else {
      C_MSG_BUNDLE = lastCol + 1;
      msgSh.getRange(1, C_MSG_BUNDLE).setValue(WANT_LABEL);
    }

    // Build UUID → row index (supports duplicates by keeping array)
    const n = Math.max(0, msgSh.getLastRow() - 1);
    if (n > 0) {
      const ids = msgSh.getRange(2, C_MSG_UUID, n, 1).getValues();
      for (let i=0;i<n;i++){
        const id = String(ids[i][0]||'').trim();
        if (!id) continue;
        if (!msgIndex.has(id)) msgIndex.set(id, []);
        msgIndex.get(id).push(i + 2); // row number
      }
    }
  }

  const last = sh.getLastRow();
  if (last < 2) return;

  let appended = 0;

  for (let r = 2; r <= last; r++) {
    const msg   = String(sh.getRange(r, C_MSG ).getValue() || '').trim();
    if (!msg) continue;

    const phone = C_PHONE ? String(sh.getRange(r, C_PHONE).getValue() || '').trim() : '';
    const uuid1 = C_UUID1 ? String(sh.getRange(r, C_UUID1).getValue() || '').trim() : '';
    const hist  = C_HIST  ? String(sh.getRange(r, C_HIST ).getValue() || '').trim() : '';

    // Bundle UUIDs list from "UUIDs" (fallback to D if empty)
    const rawUUIDs = C_UUIDS ? String(sh.getRange(r, C_UUIDS).getValue() || '').trim() : '';
    const bundleMsgUUIDs = (rawUUIDs || uuid1)
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => !!s && /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s));

    // Prefer Property/Booking from sheet; else derive
    let bookingId  = C_BOOK ? String(sh.getRange(r, C_BOOK).getValue() || '').trim() : '';
    let propertyId = C_PROP ? String(sh.getRange(r, C_PROP).getValue() || '').trim() : '';
    try { if (!bookingId && phone) bookingId = lookupBookingIdByPhone_(ss, phone) || ''; } catch(_){}
    try { if (!propertyId && bookingId) propertyId = lookupPropertyIdByBookingId_(ss, bookingId) || ''; } catch(_){}

    // Use existing JSON if present; else call model (with history)
    let obj = null;
    const existing = String(sh.getRange(r, C_JSON).getValue() || '').trim();
    if (existing) { try { obj = JSON.parse(existing); } catch(_) {} }
    if (!obj) {
      const prompt = fillTpl_(PROMPT_SUMMARIZE_MESSAGE_ACTIONS, {
        MESSAGE: msg,
        HISTORICAL_MESSAGES: hist || '[]'
      });
      const res = openAIChatJSON_(prompt, apiKey, OPENAI_MODEL);
      if (res.error) { sh.getRange(r, C_JSON).setValue(`{"error":"${String(res.error).slice(0,180)}"}`); continue; }
      obj = (res.json && typeof res.json === 'object') ? res.json : null;
      if (!obj) { sh.getRange(r, C_JSON).setValue((res.raw || res.http || '').slice(0,5000)); continue; }
      sh.getRange(r, C_JSON).setValue(JSON.stringify({
        Language: String(obj['Language']||'').trim(),
        Tone: String(obj['Tone']||'').trim(),
        Sentiment: String(obj['Sentiment']||'').trim(),
        'Action Titles': Array.isArray(obj['Action Titles']) ? obj['Action Titles'].map(s => String(s||'').trim()).filter(Boolean) : []
      }));
    }

    const lang = String(obj['Language'] || '').trim();
    const tone = String(obj['Tone'] || '').trim();
    const sent = String(obj['Sentiment'] || '').trim();
    const acts = Array.isArray(obj['Action Titles']) ? obj['Action Titles'].map(s => String(s||'').trim()).filter(Boolean) : [];
    if (!acts.length) continue;

    // Compute bundle UUID once per source row
    const bundleUUID = makeBundleUUID({ propertyId, bookingId, phone, msgUUIDs: bundleMsgUUIDs });

    // Append one log row per action
    const rows = [];
    acts.forEach(actionTitle => {
      const summaryUUID = makeSummaryUUID({ uuid: uuid1, phone, propertyId, bookingId, actionTitle });
      if (existingSUIDs.has(summaryUUID)) return;
      existingSUIDs.add(summaryUUID);

      const row = Array(logSh.getLastColumn()).fill('');
      row[HL.TS  -1] = new Date();
      row[HL.PID -1] = propertyId || '';
      row[HL.BID -1] = bookingId  || '';
      row[HL.UUID-1] = uuid1      || '';
      row[HL.PHN -1] = phone      || '';
      row[HL.LNG -1] = lang;
      row[HL.TONE-1] = tone;
      row[HL.SENT-1] = sent;
      row[HL.ACT -1] = actionTitle;
      row[HL.MSG -1] = msg;
      row[HL.JSN -1] = JSON.stringify({ Language: lang, Tone: tone, Sentiment: sent, 'Action Titles': acts });
      row[HL.SUID-1] = summaryUUID;
      row[HL.BUNDLE-1] = bundleUUID;
      rows.push(row);
    });

    if (rows.length) {
      logSh.getRange(logSh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      appended += rows.length;
    }

    // Write bundle UUID back to d:messageLog O (or the ensured bundle column) for all message UUIDs in this bundle
    if (msgSh && C_MSG_UUID && C_MSG_BUNDLE && bundleUUID && bundleMsgUUIDs.length) {
      bundleMsgUUIDs.forEach(mu => {
        const hitRows = msgIndex.get(mu);
        if (!hitRows || !hitRows.length) return;
        hitRows.forEach(rn => msgSh.getRange(rn, C_MSG_BUNDLE).setValue(bundleUUID));
      });
    }
  }

  Logger.log(`[processSummarizeMessage] wrote ${appended} row(s) to d:summarisedLogs (with Message Bundle UUIDs)`);
  // ✨ clear Column H on summarizeMessage
clearSummarizeMessageColumnH_();
}

/** =========================================================
 * Default “From” selector (uses your TWILIO_WHATSAPP_NUMBER).
 * Add once (skip if you already have it).
 * ========================================================= */
function getDefaultFrom_(recipientType) {
  const p = PropertiesService.getScriptProperties();
  const keys = [
    'TWILIO_WHATSAPP_FROM_' + String(recipientType||'').toUpperCase(),
    'TWILIO_WHATSAPP_FROM',
    'TWILIO_WHATSAPP_NUMBER',
    'TWILIO_DEFAULT_FROM'
  ];
  for (const k of keys) {
    const raw = (p.getProperty(k) || '').trim();
    if (!raw) continue;
    let v = raw;
    if (!/^whatsapp:/i.test(v)) v = 'whatsapp:' + v.replace(/^whatsapp:/i,'');
    return v;
  }
  return '';
}

/** =========================================================
 * Ensure execution headers (exact labels used by sendWhatsApp)
 * ========================================================= */
function _ensureExecutionHeaders_(execSh) {
  const want = [
    'Body','To','From','Type',
    'Ai Enrichment UUID',
    'Message Chain UUIDs',
    'Task UUIDs',
    'Recipient Type'
  ];
  const hdr = execSh.getRange(1,1,1,Math.max(1, execSh.getLastColumn())).getValues()[0] || [];
  const have = new Set(hdr.map(h => String(h||'').trim()));
  let last = execSh.getLastColumn();
  want.forEach(w => { if (!have.has(w)) execSh.getRange(1, ++last).setValue(w); });
}

/** =========================================================
 * Consolidate pending messages from d:aiLog → execution,
 * then flag source rows with sentCheck = TRUE.
 * Grouping key: (normalized To, Recipient Type)
 * ========================================================= */
function consolidateAiLogPendingToExecution() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const src  = ss.getSheetByName('d:aiLog');
  const exec = ss.getSheetByName('execution') || ss.insertSheet('execution');
  if (!src) throw new Error('Sheet "d:aiLog" not found');

  _ensureExecutionHeaders_(exec);

  // --- aiLog headers (reuse helper you already have) ---
  const H = _getAiLogHeaderMap_(src);

  // Ensure 'sentCheck' column exists on d:aiLog
  const hdr = src.getRange(1,1,1,Math.max(1,src.getLastColumn())).getValues()[0] || [];
  let C_SENT = hdr.findIndex(h => String(h||'').trim().toLowerCase() === 'sentcheck') + 1;
  if (!C_SENT) { C_SENT = src.getLastColumn() + 1; src.getRange(1, C_SENT).setValue('sentCheck'); }

  const n = Math.max(0, src.getLastRow() - 1);
  if (!n) return;

  const getCol = (label, fallback) => H[label] || fallback || null;

  const C_TO     = getCol('To', null);
  const C_RTYPE  = getCol('Recipient Type', null);
  const C_BODY   = getCol('Ai Message Response', null);
  const C_UUID   = getCol('UUID', null);
  const C_BUNDLE = getCol('Message Bundle UUID', null);
  const C_TASK   = getCol('Task UUID', null);

  if (!C_TO || !C_RTYPE || !C_BODY) throw new Error('d:aiLog must have To, Recipient Type, and Ai Message Response.');

  const toV    = src.getRange(2, C_TO,     n, 1).getValues();
  const rtV    = src.getRange(2, C_RTYPE,  n, 1).getValues();
  const bodyV  = src.getRange(2, C_BODY,   n, 1).getValues();
  const euidV  = C_UUID   ? src.getRange(2, C_UUID,   n, 1).getValues() : Array(n).fill(['']);
  const bundV  = C_BUNDLE ? src.getRange(2, C_BUNDLE, n, 1).getValues() : Array(n).fill(['']);
  const taskV  = C_TASK   ? src.getRange(2, C_TASK,   n, 1).getValues() : Array(n).fill(['']);
  const sentV  = src.getRange(2, C_SENT,   n, 1).getValues();

  // Helpers
  const normTo = (v) => {
    let s = String(v || '').trim().replace(/^whatsapp:/i,'').replace(/[^\d+]/g,'');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (!s.startsWith('+') && s.length >= 10) s = '+' + s;
    return s;
  };
  const cleanMsg = (s) => {
    s = String(s || '');
    s = s.replace(/^\[\d{1,2}:\d{2}\s*(?:am|pm)(?:,\s*\d{1,2}\/\d{1,2}\/\d{2,4})?\]\s*[^:]+:\s*/i, '');
    s = s.replace(/^(?:ramble\s*(?:airbnb)?\s*wa)\s*:\s*/i, '');
    return s.trim();
  };

  // Collect pending items
  const items = [];
  for (let i = 0; i < n; i++) {
    const already = (typeof sentV[i][0] === 'boolean') ? sentV[i][0] : /^true$/i.test(String(sentV[i][0]||''));
    const to   = String(toV[i][0]   || '').trim();
    const rtyp = String(rtV[i][0]   || '').trim();
    const body = String(bodyV[i][0] || '').trim();
    if (already || !to || !rtyp || !body) continue;

    items.push({
      row: i + 2,
      toRaw: to,
      toKey: normTo(to),
      recip: rtyp,
      body: cleanMsg(body),
      euid: String(euidV[i][0] || '').trim(),
      bundle: String(bundV[i][0] || '').trim(),
      task: String(taskV[i][0] || '').trim()
    });
  }
  if (!items.length) return;

  // Group by (toKey, recip)
  const groups = new Map();
  items.forEach(it => {
    const key = `${it.toKey}||${it.recip}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });

  // Generate one consolidated row per group
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');

  const execHdr = exec.getRange(1,1,1,exec.getLastColumn()).getValues()[0] || [];
  const idx = {};
  execHdr.forEach((h,i)=> idx[String(h||'').trim().toLowerCase()] = i+1);
  const C_E_BODY   = idx['body'];
  const C_E_TO     = idx['to'];
  const C_E_FROM   = idx['from'];
  const C_E_TYPE   = idx['type'];
  const C_E_EUID   = idx['ai enrichment uuid'];
  const C_E_CHAIN  = idx['message chain uuids'];
  const C_E_TASKS  = idx['task uuids'];
  const C_E_RTYPE  = idx['recipient type'];

  const outRows = [];
  const markTrue = new Array(n).fill(null);

  for (const [key, arr0] of groups.entries()) {
    const arr = arr0.slice(); // keep order
    // Build merge input
    const textList = arr.map((a, i) => `(${i+1}) ${a.body}`).join('\n');

    // Language hint
    let lang = 'en';
    try { lang = LanguageApp.detectLanguage(textList) || 'en'; } catch (_){}

    // Merge with GPT
    const system = `You are a hospitality messaging assistant. Write in ${lang}. Recipient type: ${arr[0].recip}.
Combine multiple draft WhatsApp messages into ONE clear, concise message.
Keep essential facts (times, addresses, Wi‑Fi SSIDs/passwords, links, commitments).
Remove duplicates and repeated greetings/signatures. Use 1–3 short paragraphs. No preamble. Return only the final text.`;
    const user   = `Combine these into a single message:\n${textList}`;

     let merged = '';
     try {
      merged = callGPTTurbo([{role:'system',content:system},{role:'user',content:user}], apiKey).trim();
    } catch (_){}
    if (!merged) merged = arr.map(a => a.body).join('\n\n');

    // Build execution row
    const toRaw    = arr[0].toRaw;
    const recip    = arr[0].recip;
    const fromNum  = getDefaultFrom_(recip);
    const euidLast = arr.map(a => a.euid).filter(Boolean).pop() || '';
    const chainIds = Array.from(new Set(arr.map(a => a.bundle).filter(Boolean))).join(',');
    const taskIds  = Array.from(new Set(arr.map(a => a.task).filter(Boolean))).join(',');

    const row = Array(exec.getLastColumn()).fill('');
    row[C_E_BODY -1]  = merged;
    row[C_E_TO   -1]  = toRaw;
    row[C_E_FROM -1]  = fromNum || '';
    row[C_E_TYPE -1]  = 'Outbound';
    if (C_E_EUID)  row[C_E_EUID -1]  = euidLast;
    if (C_E_CHAIN) row[C_E_CHAIN -1] = chainIds;
    if (C_E_TASKS) row[C_E_TASKS -1] = taskIds;
    if (C_E_RTYPE) row[C_E_RTYPE -1] = recip;
    outRows.push(row);

    // Mark all source rows in this group as TRUE
    arr.forEach(a => { markTrue[a.row - 2] = true; });
  }

  if (outRows.length) {
    exec.getRange(exec.getLastRow() + 1, 1, outRows.length, outRows[0].length).setValues(outRows);
  }

  // Write sentCheck TRUE back to d:aiLog
  for (let i = 0; i < n; i++) {
    if (markTrue[i] === true) sentV[i][0] = true;
  }
  src.getRange(2, C_SENT, n, 1).setValues(sentV);
}

/** Clear execution rows after sending (keeps headers). */
function clearExecutionTab_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('execution');
  if (!sh) return;
  const last = sh.getLastRow(), cols = sh.getLastColumn();
  if (last > 1) sh.getRange(2,1,last-1,cols).clearContent();
}



/** Ensure headers on 'execution' and append rows. Each row = {text,toRaw,recip,prop,book,cuid}. */
function writeExecutionRows_(rows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ex = ss.getSheetByName('execution') || ss.insertSheet('execution');

  const hdr = ex.getRange(1,1,1,Math.max(1, ex.getLastColumn())).getValues()[0] || [];
  const map = {}; hdr.forEach((h,i)=> map[String(h||'').trim().toLowerCase()] = i+1);
  function ensure(name) {
    const k = String(name||'').trim().toLowerCase();
    if (map[k]) return map[k];
    const c = ex.getLastColumn() + 1;
    ex.getRange(1,c).setValue(name);
    map[k] = c; return c;
  }

  const C_BODY = map['body'] || map['message'] || map['ai message response'] || ensure('Body');
  const C_TO   = map['to']   || map['to number'] || map['whatsapp to']       || ensure('To');
  const C_FROM = map['from'] || map['whatsapp from']                          || ensure('From');
  const C_PROP = map['property id'] || ensure('Property Id');
  const C_BOOK = map['booking id']  || map['reservation id'] || ensure('Booking Id');
  const C_RTP  = map['recipient type'] || ensure('Recipient Type');
  const C_CUID = map['consolidation uuid'] || ensure('Consolidation UUID');

  const lastCol = ex.getLastColumn();
  const out = rows.map(r => {
    const arr = Array(lastCol).fill('');
    arr[C_BODY-1] = r.text;
    arr[C_TO-1]   = r.toRaw;
    arr[C_FROM-1] = getDefaultFrom_(r.recip);
    arr[C_PROP-1] = r.prop || '';
    arr[C_BOOK-1] = r.book || '';
    arr[C_RTP-1]  = r.recip;
    arr[C_CUID-1] = r.cuid;
    return arr;
  });

  if (out.length) ex.getRange(ex.getLastRow()+1, 1, out.length, lastCol).setValues(out);
}

/** Clear 'execution' tab rows (keep header). */
function clearExecutionTab_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ex = ss.getSheetByName('execution');
  if (!ex) return;
  const last = ex.getLastRow();
  if (last > 1) ex.getRange(2, 1, last-1, ex.getLastColumn()).clearContent();
}


/** summarizeMessage: get Historical Messages by Message UUID (column 'UUIDs') */
function _lookupHistoricalByMsgUUID_(uuid) {
  if (!uuid) return '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('summarizeMessage');
  if (!sh) return '';
  const H = _ciHeaderMap(sh);
  const cUUID = H['uuids'] || H['uuid'] || H['message uuid'] || 4; // D by your spec
  const cHist = H['historical messages (to & from)'] || H['historical messages'] || H['history'] || 7; // G by your spec
  const last = sh.getLastRow(); if (last < 2) return '';
  const n = last - 1;
  const uuids = sh.getRange(2, cUUID, n, 1).getValues();
  const hist  = sh.getRange(2, cHist, n, 1).getValues();
  for (let i = n - 1; i >= 0; i--) {
    if (String(uuids[i][0] || '').trim() === String(uuid).trim()) {
      return String(hist[i][0] || '').trim();
    }
  }
  return '';
}


/** ========================================================================
 * Build/refresh aiResponse from d:summarisedLogs and classify with PROMPT_AI_RESPONSE_FROM_SUMMARY.
 *  - Idempotent by Summary UUID (upsert)
 *  - Fills: Update on Existing Task, Available Property Knowledge, Task Required,
 *           Task Bucket, Task Request Title, Ticket Enrichment JSON
 *  - Also writes Booking/Property/FAQs JSON + Historical Messages for context
 * ======================================================================== */
function buildAiResponseFromSummaries() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName('d:summarisedLogs');
  const dst = ss.getSheetByName('aiResponse');
  if (!src || !dst) throw new Error('Missing sheet(s): d:summarisedLogs or aiResponse');

  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');

  // --- source headers (d:summarisedLogs)
  const Hs = _ciHeaderMap(src);
  const pickS = (...names)=>{ for (const n of names){ const c=Hs[String(n).toLowerCase()]; if (c) return c; } return null; };

  const S_PROP   = pickS('Property Id','Property ID');
  const S_BOOK   = pickS('Booking Id','Booking ID','Reservation Id','Reservation ID');
  const S_PHONE  = pickS('Phone');
  const S_ACT    = pickS('Action Title');
  const S_JSON   = pickS('Summary JSON');
  const S_SUID   = pickS('Summary UUID');
  const S_BUNDLE = pickS('Message Bundle UUID','Bundle UUID');
  const S_MSGUID = pickS('Message UUID');

  // ★ Ensure 'Status' exists on d:summarisedLogs
  let S_STATUS = pickS('Status');
  if (!S_STATUS) { S_STATUS = src.getLastColumn() + 1; src.getRange(1, S_STATUS).setValue('Status'); }

  if (!S_SUID || !S_ACT) throw new Error('d:summarisedLogs must have at least Summary UUID and Action Title.');

  // --- dest headers (aiResponse) – unchanged
  const H = (function(){
    const hdr = dst.getRange(1,1,1,Math.max(1,dst.getLastColumn())).getValues()[0]||[];
    const map = {}; hdr.forEach((v,i)=> map[String(v||'').trim().toLowerCase()] = i+1);
    function ensure(label){
      const k = String(label||'').trim().toLowerCase();
      if (map[k]) return map[k];
      const c = dst.getLastColumn() + 1;
      dst.getRange(1, c).setValue(label);
      map[k] = c;
      return c;
    }
    return {
      SUMMARY_UUID : ensure('Summary UUID'),
      BUNDLE_UUID  : ensure('Message Bundle UUID'),
      PHONE        : ensure('Phone'),
      PROPERTY_ID  : ensure('Property Id'),
      BOOKING_ID   : ensure('Booking Id'),
      ACTION_TITLE : ensure('Action Title'),
      SUMMARY_JSON : ensure('Summary JSON'),
      BOOKING_JSON : ensure('Booking Details JSON'),
      PROP_JSON    : ensure('Property Details JSON'),
      FAQS_JSON    : ensure('Property FAQs JSON'),
      HIST         : ensure('Historical Messages (to & from)'),
      AVAIL_KNOW   : ensure('Available Property Knowledge'),
      PK_CAT       : ensure('Property Knowledge Category'),
      FAQ_CAT      : ensure('FAQ Category'),
      TASK_REQ     : ensure('Task Required'),
      TASK_BUCKET  : ensure('Task Bucket'),
      TASK_TITLE   : ensure('Task Request Title'),
      URGENCY      : ensure('Urgency Indicators'),
      RISK         : ensure('Escalation & Risk Indicators'),
      UPDATE_TID   : ensure('Update on Existing Task'),
      AI_REPLY     : ensure('AI Generated Responses'),
      ENRICH_JSON  : ensure('Ticket Enrichment JSON')
    };
  })();

  // index existing aiResponse by Summary UUID (upsert)
  const existingRows = Math.max(0, dst.getLastRow() - 1);
  const suidToRow = new Map();
  if (existingRows) {
    const vals = dst.getRange(2, H.SUMMARY_UUID, existingRows, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      const k = String(vals[i][0] || '').trim();
      if (k) suidToRow.set(k, i + 2);
    }
  }

  const last = src.getLastRow(); if (last < 2) return;
  const n = last - 1;

  // read source once
  const vProp   = S_PROP   ? src.getRange(2, S_PROP,   n, 1).getValues() : Array(n).fill(['']);
  const vBook   = S_BOOK   ? src.getRange(2, S_BOOK,   n, 1).getValues() : Array(n).fill(['']);
  const vPhone  = S_PHONE  ? src.getRange(2, S_PHONE,  n, 1).getValues() : Array(n).fill(['']);
  const vAct    = src.getRange(2, S_ACT,    n, 1).getValues();
  const vSjson  = S_JSON   ? src.getRange(2, S_JSON,   n, 1).getValues() : Array(n).fill(['']);
  const vSuid   = S_SUID   ? src.getRange(2, S_SUID,   n, 1).getValues() : Array(n).fill(['']);
  const vBundle = S_BUNDLE ? src.getRange(2, S_BUNDLE, n, 1).getValues() : Array(n).fill(['']);
  const vMsgU   = S_MSGUID ? src.getRange(2, S_MSGUID, n, 1).getValues() : Array(n).fill(['']);
  const vStatus = src.getRange(2, S_STATUS, n, 1).getValues();   // ← Status column values

  let writes = 0;

  for (let i = 0; i < n; i++) {
    // ❌ Skip if already processed
    const statusNow = String(vStatus[i][0] || '').trim().toLowerCase();
    if (statusNow === 'success') continue;

    const suid   = String(vSuid[i][0] || '').trim(); if (!suid) continue;
    const propId = String(vProp[i][0] || '').trim();
    const bookId = String(vBook[i][0] || '').trim();
    const phone  = String(vPhone[i][0]|| '').trim();
    const act    = String(vAct [i][0] || '').trim();
    const bundle = String(vBundle[i][0]|| '').trim();
    const sumRaw = String(vSjson[i][0] || '').trim();
    const msgUid = String(vMsgU[i][0] || '').trim();

    // contexts
    const bookingJSON = lookupSingleJSONByKeyFlexible(
      'd:bookingInfo',
      ['property id','propertyid','property'], propId,
      ['booking id','reservation id','bookingid','id'], bookId
    ) || '';

    const propJSON = lookupSingleJSONByKeyFlexible(
      'd:propertyInfo',
      ['booking id','reservation id','bookingid'], bookId
    ) || '';

    const faqsJSON = lookupJSONArrayByKeyFlexible(
      'faqs',
      ['property id','propertyid','property'], propId
    ) || '[]';

    const hist = _lookupHistoricalByMsgUUID_(msgUid);

    const { FAQS_LIST, TASK_LIST, allowedSet } = getCategoryListsForProperty(propId);

    let lang = 'en';
    try { const o = JSON.parse(sumRaw||'{}'); if (o && typeof o==='object' && o.Language) lang = String(o.Language).trim() || 'en'; } catch(_){}

    const prompt = fillTpl_(PROMPT_AI_RESPONSE_FROM_SUMMARY, {
      LANG: lang || 'en',
      ACTION_TITLE: act || '(none)',
      HISTORICAL_MESSAGES: hist || '[]',
      BOOKING_DETAILS_JSON: bookingJSON || '(none)',
      PROPERTY_DETAILS_JSON: propJSON || '(none)',
      PROP_FAQS_JSON: faqsJSON || '[]',
      FAQS_LIST: FAQS_LIST || 'Other',
      TASK_LIST: TASK_LIST || 'Other',
      SUMMARY_JSON: sumRaw || '{}'
    });

    let parsed = null;
    try {
      const res = openAIChatJSON_(prompt, apiKey, OPENAI_MODEL);
      parsed = (res && res.json) ? res.json : null;
      if (!parsed) throw new Error('No JSON in model response.');
    } catch (e) {
      parsed = {
        AvailablePropertyKnowledge: 'No',
        PropertyKnowledgeCategory: 'None',
        FAQCategory: '',
        TaskRequired: false,
        TaskBucket: 'Other',
        TaskRequestTitle: '',
        UrgencyIndicators: 'None',
        EscalationRiskIndicators: 'None',
        AiResponse: ''
      };
    }

    const availStr = String(parsed.AvailablePropertyKnowledge || 'No').trim();
    const availBool = /^yes$/i.test(availStr);
    const pkCat   = String(parsed.PropertyKnowledgeCategory || 'None').trim();
    const faqCat  = String(parsed.FAQCategory || '').trim();
    const taskReq = !!parsed.TaskRequired;

    let bucket = taskReq ? (String(parsed.TaskBucket || '').trim() || 'Other') : '';
    let title  = taskReq ? (String(parsed.TaskRequestTitle || '').trim()) : '';

    if (taskReq) {
      const picked = bucket;
      bucket = (picked && (picked === 'Other' || allowedSet.has(picked.toLowerCase()))) ? picked : 'Other';
    }

    const urgency = String(parsed.UrgencyIndicators || 'None').trim() || 'None';
    const risk    = String(parsed.EscalationRiskIndicators || 'None').trim() || 'None';
    const aiReply = String(parsed.AiResponse || '').trim();

    let updateTid = '';
    try {
      if (taskReq && bucket && bucket !== 'Other') {
        updateTid = findMatchingOpenTaskUUID(phone, propId, [_canonLabel_(bucket)]) || '';
      }
    } catch(_){}

    // upsert row
    const row = suidToRow.get(suid) || (dst.getLastRow() + 1);
    if (!suidToRow.has(suid)) suidToRow.set(suid, row);
    const lastCol = dst.getLastColumn();
    const out = Array(lastCol).fill('');

    out[H.SUMMARY_UUID -1] = suid;
    out[H.BUNDLE_UUID  -1] = bundle;
    out[H.PHONE       -1] = phone;
    out[H.PROPERTY_ID -1] = propId;
    out[H.BOOKING_ID  -1] = bookId;
    out[H.ACTION_TITLE-1] = act;
    out[H.SUMMARY_JSON-1] = sumRaw;

    out[H.BOOKING_JSON-1] = bookingJSON;
    out[H.PROP_JSON   -1] = propJSON;
    out[H.FAQS_JSON   -1] = faqsJSON;
    out[H.HIST        -1] = hist;

    out[H.AVAIL_KNOW  -1] = availBool;
    out[H.PK_CAT      -1] = pkCat;
    out[H.FAQ_CAT     -1] = (pkCat === 'Property FAQs') ? faqCat : '';
    out[H.TASK_REQ    -1] = taskReq;
    out[H.TASK_BUCKET -1] = taskReq ? bucket : '';
    out[H.TASK_TITLE  -1] = taskReq ? title  : '';
    out[H.URGENCY     -1] = urgency;
    out[H.RISK        -1] = risk;
    out[H.UPDATE_TID  -1] = updateTid;

    out[H.AI_REPLY    -1] = aiReply;

    out[H.ENRICH_JSON -1] = JSON.stringify({
      AvailablePropertyKnowledge: availStr || (availBool ? 'Yes' : 'No'),
      PropertyKnowledgeCategory : pkCat,
      FAQCategory               : out[H.FAQ_CAT -1],
      TaskRequired              : taskReq,
      TaskBucket                : out[H.TASK_BUCKET -1],
      TaskRequestTitle          : out[H.TASK_TITLE -1],
      UrgencyIndicators         : urgency,
      EscalationRiskIndicators  : risk
    });

    dst.getRange(row, 1, 1, lastCol).setValues([out]);
    writes++;

    // ✅ Mark source row as processed
    vStatus[i][0] = 'Success';
  }

  // Batch write statuses back to d:summarisedLogs
  src.getRange(2, S_STATUS, n, 1).setValues(vStatus);

  Logger.log(`[buildAiResponseFromSummaries] upserted ${writes} row(s) into aiResponse; marked ${writes} d:summarisedLogs row(s) Success`);
}





function _ensureDebugAiSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('d:debugAi');
  if (!sh) sh = ss.insertSheet('d:debugAi');
  const headers = [
    'Timestamp','Function','Row','Task UUID','Phase','Model',
    'Prompt Label','Prompt (first 5k)','Response (first 5k)',
    'Parsed JSON','Decision/Action','Flags JSON',
    'Guest Requirements','Staff Requirements','Task Scope',
    'Thread Len / Hash','Kickoff?','Resp Received?'
  ];
  const have = sh.getLastRow() >= 1 ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] : [];
  if (have.join('|') !== headers.join('|')) {
    sh.clear();
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sh;
}

function debugAiLog_(opts) {
  const sh = _ensureDebugAiSheet_();
  const clip = (s,n=5000)=>String(s==null?'':s).slice(0,n);
  const row = [
    new Date(),
    opts.fn || '',
    opts.row || '',
    opts.taskUuid || '',
    opts.phase || '',
    opts.model || 'gpt-5-mini-2025-08-07',
    opts.promptLabel || '',
    clip(opts.prompt, 5000),
    clip(opts.response, 5000),
    typeof opts.parsed === 'string' ? opts.parsed : JSON.stringify(opts.parsed||{}),
    opts.action || '',
    JSON.stringify(opts.flags||{}),
    opts.guestReq || '',
    opts.staffReq || '',
    opts.scope || '',
    `${(opts.thread||'').length} / ${Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(opts.thread||''))).slice(0,8)}`,
    !!opts.kickoff,
    !!opts.respReceived
  ];
  sh.appendRow(row);
}

function openAIChatJSON_(prompt, apiKey, model) {
  const mdl = model || 'gpt-5-mini-2025-08-07';
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method : 'post',
    contentType:'application/json',
    headers : { Authorization:`Bearer ${apiKey}` },
    payload : JSON.stringify({ model: mdl, messages:[{role:'user', content: prompt}] }),
    muteHttpExceptions:true
  });
  const rawHTTP = res.getContentText();
  if (res.getResponseCode() !== 200) {
    return { http: rawHTTP, raw: '', json: null, error: `HTTP ${res.getResponseCode()}` };
  }
  let content = '';
  try {
    const body = JSON.parse(rawHTTP);
    content = (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) ? body.choices[0].message.content.trim() : '';
  } catch (e) {
    return { http: rawHTTP, raw:'', json:null, error: 'Bad HTTP JSON' };
  }

  let parsed = null;
  try { parsed = JSON.parse(content); }
  catch(_){
    const s = content.indexOf('{'); const e = content.lastIndexOf('}') + 1;
    if (s >= 0 && e > s) { try { parsed = JSON.parse(content.slice(s,e)); } catch(_){ /* ignore */ } }
  }
  return { http: rawHTTP, raw: content, json: parsed, error: null };
}

// Keep guest-eval strictly to guest replies (avoid “Guest - Outbound” noise)
function extractGuestOnlyForEval_(threadRaw) {
  try {
    const arr = JSON.parse(String(threadRaw||'')||'[]');
    if (Array.isArray(arr)) return JSON.stringify(arr.filter(s => /Guest\s*-\s*Inbound/i.test(String(s))));
  } catch(_){}
  const lines = String(threadRaw||'').split(/\r?\n/);
  return JSON.stringify(lines.filter(s => /Guest\s*-\s*Inbound/i.test(String(s))));
}


function _clip_(s, n) {
  const str = String(s == null ? '' : s);
  if (str.length <= n) return str;
  return str.slice(0, Math.max(0, n - 1)) + '…';
}

function _jsonPreview_(s, n) {
  try { return _clip_(JSON.stringify(JSON.parse(String(s||''))), n); } catch(_) { return _clip_(String(s||''), n); }
}

/** Wrap fillTpl_ so we can see what actually went in/out for specific prompts. */
function fillTplDebug_(label, templateStr, vars) {
  let out = '';
  try {
    // what placeholders exist in this template?
    const placeholders = Array.from(new Set(String(templateStr || '').match(/{{\s*[^}]+\s*}}/g) || []))
      .map(t => t.replace(/[{}]/g,'').trim());
    // log inputs
    const kv = {};
    placeholders.forEach(k => kv[k] = (k in vars ? vars[k] : '(missing)'));
    _dbg_(`[fillTplDebug:${label}] Vars →`, kv);

    out = fillTpl_(templateStr, vars);
    _dbg_(`[fillTplDebug:${label}] Out (first 500) →\n${_clip_(out, 500)}`);
  } catch (e) {
    _dbg_(`[fillTplDebug:${label}] ERROR:`, String(e));
    // best-effort fallback so we don't break flows
    try { out = fillTpl_(templateStr, vars); } catch(_) { out = ''; }
  }
  return out;
}

/** Normalize a header for fuzzy matching. */
function _normHeader_(s) {
  return String(s || '')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[?:.,;—–-]/g, '');
}

function _ciMap_(sheet) {
  const hdr = sheet.getRange(1,1,1,Math.max(1, sheet.getLastColumn())).getValues()[0] || [];
  const m = {};
  hdr.forEach((v,i)=> m[String(v||'').trim().toLowerCase()] = i+1);
  return m;
}
function _resolveCol_(sheet, headerOrIndex) {
  if (typeof headerOrIndex === 'number') return headerOrIndex;
  const m = _ciMap_(sheet);
  return m[String(headerOrIndex||'').toLowerCase()] || null;
}

/** Canonical label normalizer for category names. */
function _canonLabel_(s) {
  return String(s||'')
    .normalize('NFKC')
    .trim()
    .replace(/[‐‑–—]/g, '-')      // dash variants → hyphen
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-&/()]/g, '')
    .toLowerCase();
}

/** =========================================================
 * NAME HELPERS (add debug)
 * ========================================================= */
function firstNameFrom(s) {
  const n = String(s||'').trim();
  if (!n) { _dbg_(`[firstNameFrom] input empty`); return ''; }
  const m = n.match(/^[^\s,.;-]+/);
  const out = (m ? m[0] : n).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'-]/g,'');
  _dbg_(`[firstNameFrom] in="${_clip_(n,60)}" → out="${out}"`);
  return out;
}
function _pickCaseInsensitive_(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  const map = {};
  Object.keys(obj).forEach(k => map[k.toLowerCase().replace(/\s+|_/g,'')] = obj[k]);
  for (const key of keys) {
    const k = String(key).toLowerCase().replace(/\s+|_/g,'');
    if (k in map) return map[k];
  }
  return '';
}

function nameFromJSON(j) {
  let out = '';
  try {
    const o = JSON.parse(String(j||'')||'{}');
    out =
      _pickCaseInsensitive_(o, ['first','firstname','given','givenname']) ||
      _pickCaseInsensitive_(o, ['name']) ||
      _pickCaseInsensitive_(o, ['fullname','full_name']) ||
      _pickCaseInsensitive_(o, ['staffname']);           // ← handles "Staff Name"
  } catch(_) {}
  _dbg_(`[nameFromJSON] out="${_clip_(out,80)}" src=${_jsonPreview_(j,120)}`);
  return out;
}

function fullNameFromJSON(j) {
  let out = '';
  try {
    const o = JSON.parse(String(j||'')||'{}');
    const first = _pickCaseInsensitive_(o, ['first','firstname','given','givenname']);
    const last  = _pickCaseInsensitive_(o, ['last','lastname','family','familyname']);
    const joined = [first, last].filter(Boolean).join(' ').trim();
    out = joined ||
          _pickCaseInsensitive_(o, ['fullname','full_name','name']) ||
          _pickCaseInsensitive_(o, ['staffname']);        // ← handles "Staff Name"
  } catch(_) {}
  _dbg_(`[fullNameFromJSON] out="${_clip_(out,80)}" src=${_jsonPreview_(j,120)}`);
  return out;
}

/** =========================================================
 * GREETING ENFORCER / PREFIX (adds debug)
 *   – keeps current behavior, just logs what's happening.
 * ========================================================= */
function ensureStaffPrefix(txt, greetFullName) {
  const original = String(txt||'').trim();
  let t = original;
  const wantFirst = firstNameFrom(greetFullName || '');

  // Ensure prefix
  if (!/^staff:/i.test(t)) {
    const hi = wantFirst ? `Hi ${wantFirst} — ` : 'Hi there — ';
    t = `Staff: ${hi}${t}`;
  }

  // Normalize any existing greeting name to the intended one
  if (wantFirst) {
    t = t.replace(/^Staff:\s*Hi\s+([^—-]+)[—-]\s*/i, `Staff: Hi ${wantFirst} — `);
  }

  const m = t.match(/^Staff:\s*Hi\s+([^—-]+)[—-]\s*/i);
  const greeted = m ? String(m[1]||'').trim() : '';
  _dbg_(`[ensureStaffPrefix] wantFirst="${wantFirst}" greeted="${_clip_(greeted,60)}" ` +
        `orig="${_clip_(original,120)}" → out="${_clip_(t,120)}"`);
  return t;
}

/** Flexible lookups for JSON tabs (headered or headerless A=JSON/B=Key). */
function lookupSingleJSONByKeyFlexible(tabName, keyHeaderCandidates, keyVal, key2HeaderCandidates, key2Val) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(tabName);
  if (!sh) return '';

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return '';

  const want1 = String(keyVal || '').trim();
  const hasSecond = key2HeaderCandidates != null && typeof key2Val !== 'undefined' && key2Val !== null;
  const want2 = hasSecond ? String(key2Val).trim() : '';

  const header = sh.getRange(1,1,1,lastCol).getValues()[0].map(v => String(v||'').trim().toLowerCase());
  const hasHeader = header.some(h => ['json','property id','booking id','reservation id','key','id'].includes(h));

  // Helper: single-key scan (bottom→up)
  function scanSingleKey(cKey, cJSON) {
    if (!cKey || !cJSON) return '';
    if (lastRow < 2) return '';
    const keys = sh.getRange(2, cKey,  lastRow-1, 1).getValues();
    const json = sh.getRange(2, cJSON, lastRow-1, 1).getValues();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (String(keys[i][0] || '').trim() === want1) return String(json[i][0] || '').trim();
    }
    return '';
  }

  // Helper: two-key scan (bottom→up)
  function scanTwoKeys(cKey1, cKey2, cJSON) {
    if (!cKey1 || !cKey2 || !cJSON) return '';
    if (lastRow < 2) return '';
    const k1 = sh.getRange(2, cKey1, lastRow-1, 1).getValues();
    const k2 = sh.getRange(2, cKey2, lastRow-1, 1).getValues();
    const js = sh.getRange(2, cJSON,  lastRow-1, 1).getValues();
    for (let i = k1.length - 1; i >= 0; i--) {
      if (String(k1[i][0] || '').trim() === want1 && String(k2[i][0] || '').trim() === want2) {
        return String(js[i][0] || '').trim();
      }
    }
    return '';
  }

  if (hasHeader) {
    const H = {}; header.forEach((h,i)=> H[h] = i+1);
    const cJSON = H['json'] || 1;

    // resolve key1 column (fallback to col B if not found)
    let cKey1 = null;
    for (const k of (keyHeaderCandidates || [])) {
      const idx = H[String(k||'').trim().toLowerCase()];
      if (idx) { cKey1 = idx; break; }
    }
    if (!cKey1) cKey1 = 2;

    if (hasSecond && want1 && want2) {
      // resolve key2 column
      let cKey2 = null;
      for (const k of (key2HeaderCandidates || [])) {
        const idx = H[String(k||'').trim().toLowerCase()];
        if (idx) { cKey2 = idx; break; }
      }
      // Try two-key match first
      const twoKeyHit = scanTwoKeys(cKey1, cKey2, cJSON);
      if (twoKeyHit) return twoKeyHit;
      // Fallback to single-key (key1 only)
      return scanSingleKey(cKey1, cJSON);
    }

    // Original single-key behaviour
    return scanSingleKey(cKey1, cJSON);
  }

  // Headerless fallbacks
  if (hasSecond && want1 && want2) {
    // Assume A=JSON, B=Key1, C=Key2
    if (lastCol < 3) return '';
      const k1 = sh.getRange(1, 2, lastRow, 1).getValues();
      const k2 = sh.getRange(1, 3, lastRow, 1).getValues();
      const js = sh.getRange(1, 1, lastRow, 1).getValues();
    for (let i = k1.length - 1; i >= 0; i--) {
        if (String(k1[i][0] || '').trim() === want1 && String(k2[i][0] || '').trim() === want2) {
          return String(js[i][0] || '').trim();
        }
      }
    // Fallback to single-key (A=JSON, B=Key1)
    const keys = sh.getRange(1, 2, lastRow, 1).getValues();
    const json = sh.getRange(1, 1, lastRow, 1).getValues();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (String(keys[i][0] || '').trim() === want1) return String(json[i][0] || '').trim();
    }
    return '';
  } else {
    // Original headerless single-key (A=JSON, B=Key)
    const keys = sh.getRange(1, 2, lastRow, 1).getValues();
    const json = sh.getRange(1, 1, lastRow, 1).getValues();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (String(keys[i][0] || '').trim() === want1) return String(json[i][0] || '').trim();
    }
    return '';
  }
}


function lookupJSONArrayByKeyFlexible(tabName, keyHeaderCandidates, keyVal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(tabName);
  if (!sh || !keyVal) return '[]';

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return '[]';

  const header = sh.getRange(1,1,1,lastCol).getValues()[0].map(v => String(v||'').trim().toLowerCase());
  const hasHeader = header.some(h => ['json','property id','booking id','key','id'].includes(h));

  const out = [];
  if (hasHeader) {
    const headerMap = {};
    header.forEach((h,i)=> headerMap[h] = i+1);
    const jsonCol = headerMap['json'] || 1;
    let keyCol = null;
    for (const k of keyHeaderCandidates) {
      const idx = headerMap[String(k||'').trim().toLowerCase()];
      if (idx) { keyCol = idx; break; }
    }
    if (!keyCol) keyCol = 2;

    const keys = (lastRow>1) ? sh.getRange(2, keyCol, lastRow-1, 1).getValues() : [];
    const json = (lastRow>1) ? sh.getRange(2, jsonCol, lastRow-1, 1).getValues() : [];
    const want = String(keyVal).trim();
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0]||'').trim() === want) {
        const s = String(json[i][0]||'').trim();
        if (s) { try { out.push(JSON.parse(s)); } catch(_) { out.push(s); } }
      }
    }
    return JSON.stringify(out);
  }

  // headerless
  const keys = sh.getRange(1, 2, lastRow, 1).getValues();
  const json = sh.getRange(1, 1, lastRow, 1).getValues();
  const want = String(keyVal).trim();
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]||'').trim() === want) {
      const s = String(json[i][0]||'').trim();
      if (s) { try { out.push(JSON.parse(s)); } catch(_) { out.push(s); } }
    }
  }
  return JSON.stringify(out);
}

// === helpers.gs — NEW: getHostPhoneByPropertyId ============================

/** Returns Host Phone (string) for a given Property Id from 'd:propertyInfo'.
 *  - Looks for a header named "Host Phone" (or close variants).
 *  - If not found in a dedicated column, tries to extract from the JSON column.
 *  - Bottom-up scan (prefers latest row).
 *  - Never throws; returns '' if not found.
 */
function getHostPhoneByPropertyId(propertyId) {
  const pid = String(propertyId || '').trim();
  if (!pid) return '';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('d:propertyInfo');
  if (!sh) return '';

  // header helpers
  const norm = s => String(s||'').replace(/[\u2018\u2019\u201C\u201D]/g,"'")
    .normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase().replace(/[?:.,;—–-]/g,'');
  const H = {};
  (sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0] || [])
    .forEach((v,i)=>{ const n = norm(v); if (n && !H[n]) H[n]=i+1; });

  const pick = (...names) => { for (const n of names){ const c=H[norm(n)]; if (c) return c; } return null; };

  const C_PID  = pick('property id','propertyid','prop id');
  const C_HOST = pick('host phone','host whatsapp','owner phone','owner whatsapp','host contact','host number');
  const C_JSON = pick('json');

  const last = sh.getLastRow();
  if (!last) return '';

  // BFS through JSON object to find a likely phone field
  function findPhoneInJSON(raw) {
    try {
      const obj = JSON.parse(String(raw||''));
      const Q = [obj];
      while (Q.length) {
        const cur = Q.shift();
        if (cur && typeof cur === 'object') {
          for (const [k,v] of Object.entries(cur)) {
            const nk = norm(k);
            if (v && typeof v === 'object') Q.push(v);
            if (/^(host|owner).*(phone|whatsapp|number)$/.test(nk)) {
              const s = String(v||'').trim();
              if (s) return s;
            }
          }
        }
      }
    } catch (_){}
    return '';
  }

  // bottom-up
  for (let r = last; r >= 2; r--) {
    const prop = C_PID ? String(sh.getRange(r, C_PID).getValue() || '').trim() : '';
    if (prop && prop !== pid) continue;

    if (C_HOST) {
      const v = String(sh.getRange(r, C_HOST).getValue() || '').trim();
      if (v) return v;
    }
    if (C_JSON) {
      const j = sh.getRange(r, C_JSON).getValue();
      const guess = findPhoneInJSON(j);
      if (guess) return guess;
    }
  }
  return '';
}

// === aiTasks_flow.gs — NEW: processHostEscalationsFromAiTasks ==============

/** Scans 'aiTasks' for rows where "Host Escalation Needed" is TRUE and "Host Notified" is not TRUE.
 *  Generates a host escalation message, looks up the Host Phone from 'd:propertyInfo' by Property Id,
 *  and appends a row to 'd:aiLog' (Recipient Type = 'Host').
 *  Idempotent per run via "Host Notified" flag.
 */
// === aiTasks_flow.gs — UPDATED: processHostEscalationsFromAiTasks ==========

/** Scans 'aiTasks' for rows where "Host Escalation Needed" is TRUE and not yet handled.
 *  - Generates a host escalation message (Recipient Type = Host) and logs it to d:aiLog.
 *  - Moves the task row to 'd:taskLog' and tags "Host Escalated" = TRUE.
 */
function processHostEscalationsFromAiTasks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('aiTasks');
  if (!sh) throw new Error('Sheet "aiTasks" not found');

  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');

  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]||[];
  const H = {}; hdr.forEach((v,i)=> H[String(v||'').trim().toLowerCase()] = i+1);
  const col = (...names)=>{ for (const n of names){ const c=H[String(n).toLowerCase()]; if (c) return c; } return null; };
  const ensure = (name)=>{ const c=col(name); if (c) return c; const nc=sh.getLastColumn()+1; sh.getRange(1,nc).setValue(name); H[name.toLowerCase()]=nc; return nc; };

  const C_UUID   = col('task uuid') || 2;
  const C_PROP   = col('property id') || 4;
  const C_ACT    = col('guest message','action title') || 5;
  const C_BUCKET = col('task bucket','sub-category','sub category') || 6;
  const C_TASKJ  = col('task json') || ensure('Task JSON');
  const C_CONV   = col('on-going conversation','ongoing conversation') || 12;
  const C_UUIDS  = col('uuids') || 11;

  const C_AH     = col('action holder') || ensure('Action Holder');
  const C_AHP    = col('action holder phone') || ensure('Action Holder Phone');
  const C_HOSTN  = col('host notified') || ensure('Host Notified');
  const C_STAT   = col('status') || ensure('Status');

  const n = Math.max(0, sh.getLastRow()-1); if (!n) return;

  for (let i=0;i<n;i++) {
    const tid = String(sh.getRange(i+2,C_UUID).getValue()||'').trim(); if (!tid) continue;
    const holder = String(sh.getRange(i+2,C_AH).getValue()||'').trim();
    const hostNot = String(sh.getRange(i+2,C_HOSTN).getValue()||'').trim().toUpperCase() === 'TRUE';
    if (holder !== 'Host' || hostNot) continue;               // ★ only when AH is Host, and not yet sent

    const pid  = String(sh.getRange(i+2,C_PROP).getValue()||'').trim();
    const act  = String(sh.getRange(i+2,C_ACT ).getValue()||'').trim();
    const buk  = String(sh.getRange(i+2,C_BUCKET).getValue()||'').trim();
    const js   = String(sh.getRange(i+2,C_TASKJ ).getValue()||'').trim();
    const conv = String(sh.getRange(i+2,C_CONV ).getValue()||'').trim();
    const chain= String(sh.getRange(i+2,C_UUIDS).getValue()||'').trim();

    // Prefer AH phone if set; else derive from property
    let hostPhone = String(sh.getRange(i+2,C_AHP).getValue()||'').trim();
    if (!hostPhone) hostPhone = getHostPhoneByPropertyId(pid) || '';

    let lang='en'; try { lang = LanguageApp.detectLanguage(act || conv || '') || 'en'; } catch(_){}
    const prompt = fillTpl_(PROMPT_HOST_ESCALATION, {
      LANG: lang, TASK_SCOPE: buk || 'Task', TASK_JSON: js,
      HOST_ESCALATION_REQUIREMENTS: '',   // criteria already known in the Task JSON
      STAFF_REQUIREMENTS: '',             // not needed to page host
      GUEST_REQUIREMENTS: '',
      GUEST_MESSAGE: act || '(none)',
      THREAD_CONTEXT: conv || '(none)',
      BOOKING_DETAILS_JSON: '',
      PROPERTY_DETAILS_JSON: ''
    });

    let hostMsg = '';
    try { hostMsg = callGPTTurbo([{ role:'user', content: prompt }], apiKey).trim(); } catch (_){}

    if (hostMsg) {
      appendOutboundToAiLog({
        recipientType:'Host', propertyId: pid, to: hostPhone,
        originalMessage: act, message: act,
        aiMessageResponse: hostMsg, status: hostPhone ? 'Success' : 'Missing Host Phone',
        taskUuid: tid, messageChainUUIDs: chain
      });
      sh.getRange(i+2, C_HOSTN).setValue(true);
      sh.getRange(i+2, C_STAT).setValue('Waiting on Host');
    }
  }
}





/** Simple header helpers */
function getHeaderMap(sheet) {
  const row = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const m = {};
  row.forEach((v,i)=> m[String(v).trim()] = i+1);
  return m;
}
function col(rowArr, header, map) { return rowArr[ map[header]-1 ]; }


/** ===========================
 *  AI DEBUG TOOLKIT (menu)
 *  =========================== */
function _ciHeaderMap(sheet){
  const cols = Math.max(1, sheet.getLastColumn());
  const hdr  = sheet.getRange(1,1,1,cols).getValues()[0] || [];
  const m = {};
  hdr.forEach((v,i)=> m[String(v||'').trim().toLowerCase()] = i+1);
  return m;
}
function _findCol(m, aliases){
  for (const a of aliases) {
    const idx = m[String(a).toLowerCase()];
    if (idx) return idx;
  }
  return null;
}

function _lookupSingleJSONByKey_(tabName, keyHeader, jsonHeader, keyVal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(tabName);
  if (!sh || !keyVal) return '';
  const m = _ciHeaderMap(sh);
  const cKey  = _findCol(m, [keyHeader]);
  const cJSON = _findCol(m, [jsonHeader, 'json']);
  if (!cKey || !cJSON) return '';
  const last = sh.getLastRow();
  if (last < 2) return '';
  const keys = sh.getRange(2, cKey,  last-1, 1).getValues();
  const json = sh.getRange(2, cJSON, last-1, 1).getValues();
  const want = String(keyVal).trim();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (String(keys[i][0]).trim() === want) return String(json[i][0] || '').trim();
  }
  return '';
}

function _lookupJSONArrayByKey_(tabName, keyHeader, jsonHeader, keyVal) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(tabName);
  if (!sh || !keyVal) return '[]';
  const m = _ciHeaderMap(sh);
  const cKey  = _findCol(m, [keyHeader]);
  const cJSON = _findCol(m, [jsonHeader, 'json']);
  if (!cKey || !cJSON) return '[]';
  const last = sh.getLastRow();
  if (last < 2) return '[]';
  const keys = sh.getRange(2, cKey,  last-1, 1).getValues();
  const json = sh.getRange(2, cJSON, last-1, 1).getValues();
  const want = String(keyVal).trim();
  const out  = [];
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === want) {
      const s = String(json[i][0] || '').trim();
      if (s) { try { out.push(JSON.parse(s)); } catch (_){ out.push(s); } }
    }
  }
  try { return JSON.stringify(out); } catch(_){ return '[]'; }
}

/** Per‑property FAQ/TASK lists from tabs 'faqs' and 'tasks', with global fallback. */
function getCategoryListsForProperty(pid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const faqsSh  = ss.getSheetByName('faqs');
  const tasksSh = ss.getSheetByName('tasks');

  const pidStr = String(pid || '').trim();
  const uniq   = arr => Array.from(new Set(arr.filter(Boolean)));

  function collectSubs(sheet) {
    if (!sheet) return { perProp: [], global: [] };
    const m = _ciHeaderMap(sheet);
    const cProp = _findCol(m, ['property id']);
    const cSub  = _findCol(m, ['sub-category name','sub-category','sub category']);
    if (!cProp || !cSub) return { perProp: [], global: [] };

    const last = sheet.getLastRow();
    if (last < 2) return { perProp: [], global: [] };

    const vals = sheet.getRange(2, 1, last-1, sheet.getLastColumn()).getValues();
    const perProp = [];
    const global  = [];
    vals.forEach(r => {
      const thisPid = String(r[cProp-1] || '').trim();
      const sub     = String(r[cSub -1] || '').trim();
      if (!sub) return;
      global.push(sub);
      if (pidStr && thisPid === pidStr) perProp.push(sub);
    });
    return { perProp: uniq(perProp), global: uniq(global) };
  }

  const F = collectSubs(faqsSh);
  const T = collectSubs(tasksSh);

  const faqsList  = (F.perProp.length ? F.perProp : F.global).join(', ');
  const tasksList = (T.perProp.length ? T.perProp : T.global).join(', ');

  const allowedSet = new Set(
    []
      .concat(faqsList ? faqsList.split(/\s*,\s*/) : [])
      .concat(tasksList ? tasksList.split(/\s*,\s*/) : [])
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );

  return { FAQS_LIST: faqsList, TASK_LIST: tasksList, allowedSet, F, T };
}

/**
 * Consolidate pending rows in "batchList" into ONE concise message per (To, Recipient Type).
 * - Groups strictly by normalized To (E.164-ish; preserves WhatsApp:) AND Recipient Type.
 * - Cleans chat-log prefixes like "[2:20 pm, ...] Ramble Airbnb WA:" before consolidation.
 * - Writes a new consolidated row per group; marks original rows as "Superseded By Consolidation UUID".
 * - Idempotent for already-superseded rows. Skips groups with only 1 message.
 * - Uses OPENAI_API_KEY via callGPTTurbo() to generate the merged message.
 *
 * Columns auto-created if missing:
 *   - Consolidation UUID
 *   - Consolidated Text
 *   - Consolidated At
 *   - Consolidated?
 *   - Superseded By Consolidation UUID
 *
 * Expected existing columns (case/spacing tolerant):
 *   - To / To Number / WhatsApp To
 *   - Recipient Type
 *   - Ai Message Response / Message / Body / Text
 *   - (optional) Execution Timestamp / Timestamp / Date / Created Date
 *   - (optional) Property Id, Booking Id
 */
function consolidateBatchListPending() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('batchList');
  if (!sh) throw new Error('Sheet "batchList" not found');

  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');

  const hdr = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0] || [];
  const norm = s => String(s || '').replace(/[\u2018\u2019\u201C\u201D]/g, "'").normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?:.,;—–-]/g,'');
  const H = {}; hdr.forEach((v,i)=> { const k = norm(v); if (k && !H[k]) H[k]=i+1; });
  const pick = (...names)=> { for (const n of names){ const c = H[norm(n)]; if (c) return c; } return null; };
  const ensure = (label)=> { const k = norm(label); if (H[k]) return H[k]; const c = sh.getLastColumn() + 1; sh.getRange(1, c).setValue(label); H[k]=c; return c; };

  const C_TO    = pick('to','to number','whatsapp to');
  const C_RTYPE = pick('recipient type');
  const C_BODY  = pick('ai message response','message','body','text');
  const C_TS    = pick('execution timestamp','timestamp','date','created date');
  const C_PROP  = pick('property id','property id');
  const C_BOOK  = pick('booking id','reservation id');
  if (!C_TO || !C_RTYPE || !C_BODY) throw new Error('batchList needs columns: To, Recipient Type, and Ai Message Response/Message/Body.');

  const C_CUID  = ensure('Consolidation UUID');
  const C_CTXT  = ensure('Consolidated Text');
  const C_CAT   = ensure('Consolidated At');
  const C_CFLAG = ensure('Consolidated?');
  const C_SUP   = ensure('Superseded By Consolidation UUID');

  const last = sh.getLastRow();
  if (last < 2) return;
  const n = last - 1;

  const toV   = sh.getRange(2, C_TO,   n, 1).getValues();
  const rtV   = sh.getRange(2, C_RTYPE,n, 1).getValues();
  const bodyV = sh.getRange(2, C_BODY, n, 1).getValues();
  const tsV   = C_TS   ? sh.getRange(2, C_TS,  n, 1).getValues() : Array(n).fill(['']);
  const propV = C_PROP ? sh.getRange(2, C_PROP,n, 1).getValues() : Array(n).fill(['']);
  const bookV = C_BOOK ? sh.getRange(2, C_BOOK,n, 1).getValues() : Array(n).fill(['']);
  const cuidV = sh.getRange(2, C_CUID, n, 1).getValues();
  const supV  = sh.getRange(2, C_SUP,  n, 1).getValues();

  function normTo(v) {
    let s = String(v || '').trim();
    s = s.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (!s.startsWith('+') && s.length >= 10) s = '+' + s;
    return s || String(v || '').trim();
  }
  function cleanMsg(s) {
    s = String(s || '');
    s = s.replace(/^\[\d{1,2}:\d{2}\s*(?:am|pm)\s*,\s*\d{1,2}\/\d{1,2}\/\d{2,4}\]\s*[^:]+:\s*/i, '');
    s = s.replace(/^\[\d{1,2}:\d{2}\s*(?:am|pm)\]\s*[^:]+:\s*/i, '');
    s = s.replace(/^(?:ramble\s*airbnb\s*wa|ramble\s*wa|airbnb\s*wa)\s*:\s*/i, '');
    return s.trim();
  }
  const asTime = v => { if (v instanceof Date) return v.getTime(); const t = Date.parse(String(v||'')); return Number.isFinite(t) ? t : 0; };
  const digest = s => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');

  // Build candidate rows
  const rows = [];
  for (let i = 0; i < n; i++) {
    const to  = String(toV[i][0] || '').trim();
    const rt  = String(rtV[i][0] || '').trim();
    const msg = String(bodyV[i][0] || '').trim();
    const already = String(cuidV[i][0] || '').trim() || String(supV[i][0] || '').trim();
    if (!to || !rt || !msg || already) continue;
    rows.push({
      row: i + 2,
      toRaw: to,
      toKey: normTo(to),
      recip: rt,
      msg: cleanMsg(msg),
      ts: tsV[i][0],
      prop: String(propV[i][0] || '').trim(),
      book: String(bookV[i][0] || '').trim()
    });
  }
  if (!rows.length) return;

  // Group by (To + Recipient Type)
  const groups = new Map();
  rows.forEach(r => {
    const key = `${r.toKey}||${r.recip}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  const consolidated = [];
  const supersededMarks = [];

  for (const [key, arr0] of groups.entries()) {
    const arr = arr0.slice().sort((a,b)=> asTime(a.ts) - asTime(b.ts) || a.row - b.row);
    if (arr.length <= 1) continue;

    const recip = arr[0].recip;
    const toRaw = arr[0].toRaw;
    const prop  = arr.find(x=>x.prop)?.prop || '';
    const book  = arr.find(x=>x.book)?.book || '';
    const sourceText = arr.map((x,idx)=> `(${idx+1}) ${x.msg}`).join('\n');

    let lang = 'en';
    try { lang = LanguageApp.detectLanguage(arr.map(x=>x.msg).join(' ')) || 'en'; } catch(_){}

    const system = fillTpl_(PROMPT_CONSOLIDATE_BATCH_MESSAGES_SYSTEM, { LANG: lang, RECIPIENT_TYPE: recip });
    const user   = fillTpl_(PROMPT_CONSOLIDATE_BATCH_MESSAGES_USER,   { SOURCE_MESSAGES: sourceText });

    let merged = '';
    try { merged = callGPTTurbo([{role:'system', content: system},{role:'user', content: user}], apiKey).trim(); } catch (_){}
    if (!merged) continue;

    const cuid = 'CNS_' + digest(key + '|' + merged.slice(0,512)).slice(0,22);
    consolidated.push({ cuid, toRaw, recip, text: merged, prop, book });
    arr.forEach(r => supersededMarks.push({ row: r.row, cuid }));
  }

  if (!consolidated.length) return;

  // ✅ Write the consolidated outputs to the 'execution' tab
  writeExecutionRows_(consolidated);

  // Mark originals in batchList as superseded and annotated
  const supColVals = sh.getRange(2, C_SUP, n, 1).getValues();
  const flagColVals= sh.getRange(2, C_CFLAG, n, 1).getValues();
  const txtColVals = sh.getRange(2, C_CTXT, n, 1).getValues();
  const atColVals  = sh.getRange(2, C_CAT,  n, 1).getValues();
  const cuidColVals= sh.getRange(2, C_CUID, n, 1).getValues();

  supersededMarks.forEach(m => {
    const i = m.row - 2;
    supColVals[i][0]  = m.cuid;
    flagColVals[i][0] = true;
    cuidColVals[i][0] = m.cuid;
    atColVals[i][0]   = new Date();
    // (Optional) don't overwrite original body; we only note consolidated text id
    txtColVals[i][0]  = txtColVals[i][0] || '(consolidated)';
  });

  sh.getRange(2, C_SUP,  n, 1).setValues(supColVals);
  sh.getRange(2, C_CFLAG,n, 1).setValues(flagColVals);
  sh.getRange(2, C_CUID, n, 1).setValues(cuidColVals);
  sh.getRange(2, C_CTXT, n, 1).setValues(txtColVals);
  sh.getRange(2, C_CAT,  n, 1).setValues(atColVals);
}




/** =========================================================
 * CATEGORY MAPS (lightweight counts for visibility)
 * ========================================================= */
function getCategoryInfoMaps() {
  const res = (function ORIGINAL(){ // keep original body in an IIFE so we can hook after
    // === BEGIN ORIGINAL getCategoryInfoMaps BODY (unchanged) ===
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const legacy = ss.getSheetByName('categoryInfo');  // optional
    const faqsSh = ss.getSheetByName('faqs');          // preferred
    const tasksSh= ss.getSheetByName('tasks');         // preferred

    const typeMap        = Object.create(null);
    const ownerMap       = Object.create(null);
    const ownerMapByProp = Object.create(null);

    const ci = (s) => _canonLabel_(s);

    const readHdr = (sh) => {
      const row = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] || [];
      const m = {}; row.forEach((v,i)=> m[String(v||'').trim().toLowerCase()] = i+1);
      return m;
    };

    // NEW FAQs
    if (faqsSh) {
      const H = readHdr(faqsSh);
      const cSUB = H['sub-category name'] || H['sub-category'] || H['sub category'];
      if (cSUB) {
        const n = Math.max(0, faqsSh.getLastRow()-1);
        if (n) {
          const vals = faqsSh.getRange(2,1,n,faqsSh.getLastColumn()).getValues();
          vals.forEach(r => {
            const sub = ci(r[cSUB-1] || '');
            if (sub) typeMap[sub] = 'faq';
          });
        }
      }
    }

    // NEW TASKS (reads Staff/Guest/Host requirements + Staff Details JSON)
    if (tasksSh) {
      const H = readHdr(tasksSh);
      const cPID   = H['property id'];
      const cSUB   = H['sub-category name'] || H['sub-category'] || H['sub category'];
      const cREQ   = H['requirements to complete task'] || H['requirements']; // legacy catch-all
      const cSID   = H['staff id'];
      const cSNM   = H['staff name'];
      const cSPH   = H['staff phone'];
      const cSJSON = H['staff details json'];

      // NEW columns you added
      const cHOST  = H['host escalation'];     // column I on tasks
      const cSREQ  = H['staff requirements'];  // column J on tasks
      const cGREQ  = H['guest requirements'];  // column K on tasks

      if (cSUB) {
        const n = Math.max(0, tasksSh.getLastRow()-1);
        if (n) {
          const vals = tasksSh.getRange(2,1,n,tasksSh.getLastColumn()).getValues();
          vals.forEach(r => {
            const pid = String(r[cPID-1] || '').trim();
            const subKey = ci(r[cSUB-1] || '');
            if (!subKey) return;
            typeMap[subKey] = 'task';

            const owner = {
              staffId        : cSID   ? String(r[cSID-1]   || '').trim() : '',
              staffName      : cSNM   ? String(r[cSNM-1]   || '').trim() : '',
              staffPhone     : cSPH   ? String(r[cSPH-1]   || '').trim() : '',
              req            : cREQ   ? String(r[cREQ-1]   || '').trim() : '',
              detailsJSON    : cSJSON ? String(r[cSJSON-1] || '').trim() : '',
              // NEW fields captured from tasks
              hostEscalation : cHOST  ? String(r[cHOST-1]  || '').trim() : '',
              staffReq       : cSREQ  ? String(r[cSREQ-1]  || '').trim() : '',
              guestReq       : cGREQ  ? String(r[cGREQ-1]  || '').trim() : ''
            };
            if (!ownerMap[subKey]) ownerMap[subKey] = owner;
            if (pid) ownerMapByProp[`${pid}||${subKey}`] = owner;
          });
        }
      }
    }

    // LEGACY merge unchanged
    const legacySh = legacy;
    if (legacySh) {
      const H = (function readHdr(sh){ const row = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] || [];
        const m = {}; row.forEach((v,i)=> m[String(v||'').trim().toLowerCase()] = i+1); return m; })(legacySh);
      const cPID  = H['property id'];
      const cTYPE = H['type'] || H['primary-category'];
      const cSUB  = H['sub-category'] || H['sub-category name'];
      const cREQ  = H['requirements to complete task'] || H['requirements'];
      const cSID  = H['staff id'];
      const cSNM  = H['staff name'];
      const cSPH  = H['staff phone'];

      if (cSUB && cTYPE) {
        const n = Math.max(0, legacySh.getLastRow()-1);
        if (n) {
          const vals = legacySh.getRange(2,1,n,legacySh.getLastColumn()).getValues();
          vals.forEach(r => {
            const pid = String(r[cPID-1] || '').trim();
            const typ = String(r[cTYPE-1] || '').trim().toLowerCase();
            const subKey = (function ci(s){return String(s||'').normalize('NFKC').trim().replace(/[‐-–—]/g, '-').replace(/[\u2018\u2019\u201C\u201D]/g, "'").replace(/\s+/g, ' ').replace(/[^\w\s\-&/()]/g, '').toLowerCase();})(r[cSUB-1] || '');
            if (!subKey || !typ) return;

            if (!typeMap[subKey]) typeMap[subKey] = typ;
            if (typ === 'task') {
              const owner = {
                staffId        : cSID ? String(r[cSID-1] || '').trim() : '',
                staffName      : cSNM ? String(r[cSNM-1] || '').trim() : '',
                staffPhone     : cSPH ? String(r[cSPH-1] || '').trim() : '',
                req            : cREQ ? String(r[cREQ-1] || '').trim() : '',
                detailsJSON    : '',
                hostEscalation : '',
                staffReq       : '',
                guestReq       : ''
              };
              if (!ownerMap[subKey]) ownerMap[subKey] = owner;
              if (pid && !ownerMapByProp[`${pid}||${subKey}`]) {
                ownerMapByProp[`${pid}||${subKey}`] = owner;
              }
            }
          });
        }
      }
    }

    return { typeMap, ownerMap, ownerMapByProp };
    // === END ORIGINAL BODY ===
  })();

  // lightweight visibility
  if (DEBUG_AI) {
    const owners = Object.values(res.ownerMap || {});
    const withNames = owners.filter(o => (o.staffName || '').trim()).length;
    const withJSON  = owners.filter(o => (o.detailsJSON || '').trim()).length;
    _dbg_(`[getCategoryInfoMaps] owners=${owners.length} withStaffName=${withNames} withStaffJSON=${withJSON}`);
  }
  return res;
}





/** =========================================================================
 *  d:aiLog writer – EXACT HEADERS you provided
 *  ========================================================================= */

function _getAiLogHeaderMap_(sheet) {
  const row = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
  const byNorm = {};
  row.forEach((h, i) => { const n = _normHeader_(h); if (n && !byNorm[n]) byNorm[n] = i + 1; });
  const pick = (...names) => { for (const n of names) { const c = byNorm[_normHeader_(n)]; if (c) return c; } return null; };

  // Canonical targets (with synonyms so older headers still resolve)
  return {
    'Execution Timestamp'           : pick('Execution Timestamp','Timestamp','Date'),
    'UUID'                          : pick('AI Enrichment UUID','Ai Enrichment UUID','Enrichment UUID','UUID'),
    'Recipient Type'                : pick('Recipient Type'),
    'Property Id'                   : pick('Property Id','Property ID'),
    'Booking Id'                    : pick('Booking Id','Booking ID','Reservation Id','Reservation ID'),
    'To'                            : pick('To','To Number','WhatsApp To'),
    'Message Bundle UUID'           : pick('Message Bundle UUID','Message Chain UUIDs','Message Chain UUID','Bundle UUID'),
    'Message'                       : pick('Message','Action Title'),
    'Ticket Enrichment JSON'        : pick('Ticket Enrichment JSON'),
    'Urgency Indicators'            : pick('Urgency Indicators','Urgency'),
    'Escalation & Risk Indicators'  : pick('Escalation & Risk Indicators','Escalation and Risk Indicators'),
    'Available Property Knowledge'  : pick('Available Property Knowledge','Available Knowledge to Respond?','Available Knowledge'),
    'Property Knowledge Category'   : pick('Property Knowledge Category','Sub-Category','Sub Category'),
    'Task Required'                 : pick('Task Required'),
    'Task Bucket'                   : pick('Task Bucket'),
    'Task Request Title'            : pick('Task Request Title','Task Title'),
    'Ai Message Response'           : pick('Ai Message Response','AI Message Response'),
    'Status'                        : pick('Status'),
    'Task Created'                  : pick('Task Created'),
    'Task UUID'                     : pick('Task UUID')
  };
}


/** Writes exactly one row to d:aiLog (no duplicates). */
function appendOutboundToAiLog(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('d:aiLog');
  if (!sh) throw new Error('Sheet "d:aiLog" not found');

  // Ensure headers (exact labels; reuse synonyms when present)
  (function ensureHeaders() {
    const want = [
      'Execution Timestamp','UUID','Recipient Type','Property Id','Booking Id','To',
      'Message Bundle UUID','Message','Ticket Enrichment JSON','Urgency Indicators',
      'Escalation & Risk Indicators','Available Property Knowledge','Property Knowledge Category',
      'Task Required','Task Bucket','Task Request Title','Ai Message Response','Status',
      'Task Created','Task UUID'
    ];
    const row = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0] || [];
    const have = new Set(row.map(v => String(v||'').trim()));
    const Hsyn = _getAiLogHeaderMap_(sh);
    let col = sh.getLastColumn();
    want.forEach(h => { if (!have.has(h) && !Hsyn[h]) { sh.getRange(1, ++col).setValue(h); } });
  })();

  const H = _getAiLogHeaderMap_(sh);
  const lastCol = sh.getLastColumn();
  const out = Array(lastCol).fill('');
  const set = (header, val) => { const c = H[header]; if (c) out[c - 1] = (val == null ? '' : val); };

  const now   = new Date();
  const uuid  = entry.uuid || Utilities.getUuid();
  const msgBundle = entry.messageBundleUUID || entry.messageChainUUIDs || entry.messageChainUUID || '';
  const msgText   = (entry.message != null ? entry.message : (entry.originalMessage != null ? entry.originalMessage : ''));

  set('Execution Timestamp', now);
  set('UUID', uuid);
  set('Recipient Type', entry.recipientType || '');
  set('Property Id', entry.propertyId || '');
  set('Booking Id', entry.bookingId || '');
  set('To', entry.to || '');
  set('Message Bundle UUID', msgBundle || '');
  set('Message', msgText || '');                           // = Action Title
  set('Ticket Enrichment JSON', entry.ticketEnrichmentJSON || '');
  set('Urgency Indicators', entry.urgencyIndicators || '');
  set('Escalation & Risk Indicators', entry.escalationAndRiskIndicators || '');

  // ★ Only write TRUE for Available Property Knowledge; leave blank otherwise
  (function writeAPK() {
    let v = undefined;
    if (Object.prototype.hasOwnProperty.call(entry,'availablePropertyKnowledge')) v = entry.availablePropertyKnowledge;
    else if (Object.prototype.hasOwnProperty.call(entry,'availableKnowledge'))     v = entry.availableKnowledge;
    const truthy = (vv) => (vv === true) || /^(true|yes|y|1)$/i.test(String(vv||''));
    if (truthy(v)) set('Available Property Knowledge', true);
  })();

  set('Property Knowledge Category', entry.propertyKnowledgeCategory || '');
  set('Task Required', (entry.taskRequired === true) ? true : '');
  set('Task Bucket', entry.taskBucket || (entry.subCategory || ''));
  set('Task Request Title', entry.taskRequestTitle || '');
  set('Ai Message Response', entry.aiMessageResponse != null ? entry.aiMessageResponse : '');
  set('Status', entry.status || '');
  set('Task Created', entry.taskCreated || '');
  set('Task UUID', entry.taskUuid || '');

  sh.getRange(sh.getLastRow() + 1, 1, 1, lastCol).setValues([out]);
  return uuid;
}



/** =========================================================================
 *  ENRICHMENT (pull JSONs, classify, write split columns)
 *  ========================================================================= */
function enrichAndExpand(sheetName) {
  const targetSheetName = sheetName || 'aiResponse';
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const sh  = ss.getSheetByName(targetSheetName);
  if (!sh) throw new Error(`Sheet "${targetSheetName}" not found`);

  const api = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!api) throw new Error('OPENAI_API_KEY missing.');

  // inputs
  const hdr = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0] || [];
  const map = {}; hdr.forEach((v,i)=> map[String(v||'').trim().toLowerCase()] = i+1);
  const find = (arr)=> { for (const a of arr){ const c=map[String(a).toLowerCase()]; if (c) return c; } return null; };

  const COL_MESSAGE     = find(['message','inbound message']);
  const COL_LANGUAGE    = 10; // Column J (explicit per your layout)
  const COL_PROP_ID     = find(['property id']);
  const COL_BOOKING_ID  = find(['booking id','reservation id']);

  // ★ Historical conversation column (to & from)
  const COL_HIST        = find([
    'historical messages (to & from)',
    'historical messages',
    'conversation history',
    'historical conversation',
    'history'
  ]);

  // outputs (classification fields)
  function ensureColByName(name) {
    const idx = hdr.findIndex(h => String(h||'').trim().toLowerCase() === name.toLowerCase());
    if (idx >= 0) return idx + 1;
    const newCol = sh.getLastColumn() + 1;
    sh.getRange(1, newCol).setValue(name);
    hdr.push(name);
    map[name.toLowerCase()] = newCol;
    return newCol;
  }

  const COL_JSON      = ensureColByName('Ticket Enrichment JSON');
  const COL_TONE      = ensureColByName('Tone');
  const COL_SENT      = ensureColByName('Sentiment');
  const COL_URG       = ensureColByName('Urgency Indicators');
  const COL_SUB       = ensureColByName('Sub-Category');
  const COL_COMP      = ensureColByName('Complexity Indicators');
  const COL_RISK      = ensureColByName('Escalation & Risk Indicators');
  const COL_KNOW      = ensureColByName('Available Knowledge to Respond?');

  // visibility context JSONs (authoritative cells used by prompts) — typically F:H
  const COL_BOOKING_JSON  = ensureColByName('Booking Details JSON');   // typically column F
  const COL_PROPINFO_JSON = ensureColByName('Property Details JSON');  // typically column G
  const COL_FAQS_JSON     = ensureColByName('Property FAQs JSON');     // typically column H

  Logger.log(`[enrichAndExpand] Columns: BOOKING_JSON=${COL_BOOKING_JSON}, PROPERTY_JSON=${COL_PROPINFO_JSON}, FAQS_JSON=${COL_FAQS_JSON}, HIST=${COL_HIST}`);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  // ✅ Ensure Language header in J and fill formulas before enrichment
  const langHeader = String(sh.getRange(1, COL_LANGUAGE).getValue() || '').trim();
  if (!langHeader) sh.getRange(1, COL_LANGUAGE).setValue('Language');
  // J references E via RC[-5]; apply from row 2 to lastRow
  sh.getRange(2, COL_LANGUAGE, lastRow - 1, 1)
    .setFormulaR1C1('=IF(RC[-5]="","",DETECTLANGUAGE(RC[-5]))');

  // clear enrichment outputs (keep context JSONs & Language)
  sh.getRange(2, COL_JSON, lastRow-1, 1).clearContent();
  sh.getRange(2, COL_TONE, lastRow-1, 1).clearContent();
  sh.getRange(2, COL_SENT, lastRow-1, 1).clearContent();
  sh.getRange(2, COL_URG,  lastRow-1, 1).clearContent();
  sh.getRange(2, COL_SUB,  lastRow-1, 1).clearContent();
  sh.getRange(2, COL_COMP, lastRow-1, 1).clearContent();
  sh.getRange(2, COL_RISK, lastRow-1, 1).clearContent();
  sh.getRange(2, COL_KNOW, lastRow-1, 1).clearContent();

  let enriched = 0;
  const _len = (s) => String(s||'').length;

  for (let r = 2; r <= lastRow; r++) {
    const msgVal = COL_MESSAGE     ? sh.getRange(r, COL_MESSAGE).getValue()     : '';
    const propId = COL_PROP_ID     ? sh.getRange(r, COL_PROP_ID).getValue()     : '';
    const bookId = COL_BOOKING_ID  ? sh.getRange(r, COL_BOOKING_ID).getValue()  : '';

    // ★ historical conversation (to & from)
    const hist   = COL_HIST        ? sh.getRange(r, COL_HIST).getValue()        : '';

    if (!msgVal) continue;

    // (Removed per-row LanguageApp detection to avoid overwriting the formula in J)

    // ===== 1) Lookups → write contexts to cells (F/G/H by header) =====
    // NEW: Booking JSON must match BOTH Property Id + Booking Id; falls back to Property Id only via helper itself.
    const bookingJSONLookup = lookupSingleJSONByKeyFlexible(
      'd:bookingInfo',
      ['property id','propertyid','property'], propId,
      ['booking id','reservation id','bookingid','id'], bookId
    );

    const propInfoJSONLookup = lookupSingleJSONByKeyFlexible(
      'd:propertyInfo',
      ['booking id','reservation id','bookingid'], bookId
    );

    const faqsJSONArrLookup  = lookupJSONArrayByKeyFlexible(
      'faqs',
      ['property id','propertyid','property'], propId
    );

    sh.getRange(r, COL_BOOKING_JSON ).setValue(bookingJSONLookup  || '');
    sh.getRange(r, COL_PROPINFO_JSON).setValue(propInfoJSONLookup || '');
    sh.getRange(r, COL_FAQS_JSON    ).setValue(faqsJSONArrLookup  || '[]');

    // Commit writes so the cells are authoritative
    SpreadsheetApp.flush();

    // ===== 2) Re-read the three JSONs from the cells (authoritative) =====
    const bookingJSONCell  = String(sh.getRange(r, COL_BOOKING_JSON ).getValue() || '');
    const propInfoJSONCell = String(sh.getRange(r, COL_PROPINFO_JSON).getValue() || '');
    const faqsJSONCell     = String(sh.getRange(r, COL_FAQS_JSON    ).getValue() || '[]');

    Logger.log(`[enrichAndExpand] Row ${r}: booking.len=${_len(bookingJSONCell)} prop.len=${_len(propInfoJSONCell)} faqs.len=${_len(faqsJSONCell)} msg.len=${_len(msgVal)}`);

    // Build lists and allowed set (used for Sub-Category normalization)
    const { FAQS_LIST, TASK_LIST, allowedSet } = getCategoryListsForProperty(propId);

    // ===== 3) Build enrichment prompt using ONLY the three JSONs from cells =====
    const prompt = fillTpl_(PROMPT_ENRICHMENT_CLASSIFY_JSON, {
      FAQS_LIST            : (FAQS_LIST || 'Other'),
      TASK_LIST            : (TASK_LIST || 'Other'),
      BOOKING_DETAILS_JSON : bookingJSONCell  || '(none)',
      PROPERTY_DETAILS_JSON: propInfoJSONCell || '(none)',
      PROP_FAQS_JSON       : faqsJSONCell     || '[]',
      HISTORICAL_MESSAGES  : String(hist || '').trim() || '(none)',
      INSERT_GUEST_MESSAGE_HERE: String(msgVal)
    });

    // ===== 4) Call OpenAI and parse JSON =====
    let json;
    try {
      const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
        method : 'post',
        contentType:'application/json',
        headers : { Authorization:`Bearer ${api}` },
        payload: JSON.stringify({
        model: OPENAI_MODEL,
        messages:[{ role:'user', content: prompt }]
      }),
        muteHttpExceptions:true
      });
      if (res.getResponseCode() !== 200) throw new Error(res.getContentText());

      const content = JSON.parse(res.getContentText()).choices[0].message.content.trim();
      try { json = JSON.parse(content); }
      catch(_) {
        const s = content.indexOf('{'); const e = content.lastIndexOf('}') + 1;
        if (s >= 0 && e > s) json = JSON.parse(content.slice(s, e));
      }
      if (!json || typeof json !== 'object') throw new Error('Model did not return JSON');
    } catch (err) {
      sh.getRange(r, COL_JSON).setValue(`{"error":"${String(err).slice(0,200)}"}`);
      Logger.log(`[enrichAndExpand] Row ${r}: ERROR calling OpenAI — ${String(err).slice(0,200)}`);
      continue;
    }

    // ===== 5) Normalize fields and write back =====
    const pick = (k) => (json[k] == null ? '' : String(json[k]).trim());

    // Sub-Category normalization to allowed set
    const normalizedSub = (() => {
      const original = pick('Sub-Category');
      const items = String(original || '')
        .split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
      if (!items.length) return 'Other';
      const keep = items.filter(s => s === 'Other' || allowedSet.has(s.toLowerCase()));
      if (!keep.length) return 'Other';
      const seen = new Set(); const out = [];
      keep.forEach(s => { const k=s.toLowerCase(); if(!seen.has(k)){ seen.add(k); out.push(s); }});
      return out.join(', ');
    })();

    // KnowledgeAvailable → Yes/No normalization
    let know = pick('KnowledgeAvailable');
    const kv = know.toLowerCase();
    if (kv === 'yes' || kv === 'y' || kv === 'true') know = 'Yes';
    else if (kv === 'no' || kv === 'n' || kv === 'false') know = 'No';
    else if (know !== 'Yes' && know !== 'No') know = 'No';

    // Write outputs
    sh.getRange(r, COL_JSON).setValue(JSON.stringify(json));
    sh.getRange(r, COL_TONE).setValue(pick('Tone'));
    sh.getRange(r, COL_SENT).setValue(pick('Sentiment'));
    sh.getRange(r, COL_URG ).setValue(pick('Urgency'));
    sh.getRange(r, COL_SUB ).setValue(normalizedSub);
    sh.getRange(r, COL_COMP).setValue(pick('Complexity'));
    sh.getRange(r, COL_RISK).setValue(pick('EscalationRisk'));
    sh.getRange(r, COL_KNOW).setValue(know);

    Logger.log(`[enrichAndExpand] Row ${r}: enriched OK (Tone=${pick('Tone')}, Sent=${pick('Sentiment')}, Urg=${pick('Urgency')}, Sub=${normalizedSub}, Know=${know})`);
    enriched++;
  }

  Logger.log(`${enriched} row(s) enriched on "${targetSheetName}" using Booking/Property/FAQs JSON from cells F:H.`);
}







/** =========================================================================
 *  Reply generation → ALWAYS write to d:aiLog (Recipient Type = Guest)
 *  ========================================================================= */
function createReplyAndLog() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const src    = ss.getSheetByName('aiResponse');
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');
  if (!src)    throw new Error('Sheet "aiResponse" not found');

  const H = _ciHeaderMap(src);
  const pick = (...names)=>{ for (const n of names){ const c = H[String(n).toLowerCase()]; if (c) return c; } return null; };
  const read = (r,c)=> String(src.getRange(r, c||0).getValue() || '').trim();
  const set  = (r,c,v)=> { if (c) src.getRange(r,c).setValue(v); };

  const C = {
    SUMMARY_UUID : pick('Summary UUID'),
    ENRICH_UUID  : pick('AI Enrichment UUID','Ai Enrichment UUID','Enrichment UUID','Summary UUID'),
    BUNDLE_UUID  : pick('Message Bundle UUID','Bundle UUID','Message Chain UUIDs'),
    PHONE        : pick('Phone'),
    PROPERTY_ID  : pick('Property Id','Property ID'),
    BOOKING_ID   : pick('Booking Id','Booking ID','Reservation Id','Reservation ID'),
    ACTION_TITLE : pick('Action Title'),
    SUMMARY_JSON : pick('Summary JSON'),

    BOOKING_JSON : pick('Booking Details JSON'),
    PROP_JSON    : pick('Property Details JSON'),
    FAQS_JSON    : pick('Property FAQs JSON'),
    HIST         : pick('Historical Messages (to & from)','Historical Messages','Conversation History'),

    AVAIL_KNOW   : pick('Available Property Knowledge','Available Knowledge to Respond?'),
    PK_CAT       : pick('Property Knowledge Category'),
    FAQ_CAT      : pick('FAQ Category'),
    TASK_REQ     : pick('Task Required'),
    TASK_BUCKET  : pick('Task Bucket'),
    TASK_TITLE   : pick('Task Request Title'),
    URGENCY      : pick('Urgency Indicators'),
    RISK         : pick('Escalation & Risk Indicators'),

    AI_REPLY     : pick('AI Generated Responses'),
    ENRICH_JSON  : pick('Ticket Enrichment JSON')
  };

  const last = src.getLastRow(); if (last < 2) return;

  for (let r = 2; r <= last; r++) {
    const actionTitle = read(r, C.ACTION_TITLE); if (!actionTitle) continue;

    const phone    = read(r, C.PHONE);
    const propId   = read(r, C.PROPERTY_ID);
    const booking  = read(r, C.BOOKING_ID);
    const bundleId = read(r, C.BUNDLE_UUID);
    const euid     = read(r, C.ENRICH_UUID) || read(r, C.SUMMARY_UUID);

    const sumRaw   = read(r, C.SUMMARY_JSON) || '{}';
    let   lang     = 'en';
    try { const o = JSON.parse(sumRaw||'{}'); if (o && o.Language) lang = String(o.Language).trim() || 'en'; } catch(_){}

    const haveKnow = /^true$/i.test(read(r, C.AVAIL_KNOW)) || /^yes$/i.test(read(r, C.AVAIL_KNOW));
    let   pkTitle  = read(r, C.PK_CAT);
    const faqTitle = read(r, C.FAQ_CAT);
    if (haveKnow && !pkTitle && faqTitle) { pkTitle = faqTitle; set(r, C.PK_CAT, pkTitle); }
    if (!haveKnow && pkTitle) { set(r, C.PK_CAT, ''); pkTitle = ''; }

    const taskReq   = /^true$/i.test(read(r, C.TASK_REQ));
    const taskBucket= taskReq ? read(r, C.TASK_BUCKET) : '';
    const taskTitle = taskReq ? read(r, C.TASK_TITLE)  : '';

    let aiReply = read(r, C.AI_REPLY);
    if (!aiReply) {
      const systemMsg = `You are a concise villa assistant. Reply in ${lang}. Use booking/property/FAQ data if available; otherwise give a short helpful message. Keep 2–4 sentences.`;
      const userMsg = [
        'ACTION_TITLE:', actionTitle,
        'SUMMARY_JSON:', sumRaw,
        'HIST:', read(r, C.HIST) || '[]',
        'BOOKING_DETAILS_JSON:', read(r, C.BOOKING_JSON) || '(none)',
        'PROPERTY_DETAILS_JSON:', read(r, C.PROP_JSON)    || '(none)',
        'PROPERTY_FAQS_JSON:',    read(r, C.FAQS_JSON)    || '[]',
        'FLAGS:', JSON.stringify({
          available_property_knowledge: haveKnow,
          property_knowledge_category_title: pkTitle || '',
          task_required: taskReq,
          task_bucket: taskBucket || '',
          task_request_title: taskTitle || ''
        })
      ].join('\n');
      try { aiReply = callGPTTurbo([{role:'system',content:systemMsg},{role:'user',content:userMsg}], apiKey).trim(); } catch (_){}
      if (aiReply) set(r, C.AI_REPLY, aiReply);
    }

    appendOutboundToAiLog({
      uuid                    : euid || '',
      recipientType           : 'Guest',
      propertyId              : propId || '',
      bookingId               : booking || '',
      to                      : phone || '',
      messageBundleUUID       : bundleId || '',
      message                 : actionTitle,                 // Message = Action Title
      ticketEnrichmentJSON    : read(r, C.ENRICH_JSON) || '',
      urgencyIndicators       : read(r, C.URGENCY) || '',
      escalationAndRiskIndicators: read(r, C.RISK) || '',
      availablePropertyKnowledge: haveKnow,
      propertyKnowledgeCategory: pkTitle || '',
      taskRequired            : taskReq,
      taskBucket              : taskBucket || '',
      taskRequestTitle        : taskTitle || '',
      aiMessageResponse       : aiReply || '',
      status                  : aiReply ? 'Success' : 'Error',
      taskCreated             : '',
      taskUuid                : ''
    });
  }
}



function clearSummarizeMessageColumnH_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('summarizeMessage');
  if (!sh) return;
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 8, last - 1, 1).clearContent(); // Column H
}

function clearAiResponseSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('aiResponse');
  if (!sh) return;
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, lastCol).clearContent(); // keep headers
}




/** =========================================================
 * createStaffTasks (log when we WRITE Staff Name to aiTasks)
 *   – paste this whole function to replace your existing one.
 *   – body is the same, only a few _dbg_() lines added near writes.
 * ========================================================= */
function createStaffTasks() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const logSh = ss.getSheetByName('d:aiLog');
  const taskSh= ss.getSheetByName('aiTasks');
  if (!logSh || !taskSh) throw new Error('Required sheet(s) missing: d:aiLog or aiTasks.');

  // --- helpers (local) ---
  const Hlog = _getAiLogHeaderMap_(logSh);
  const uniq = a => Array.from(new Set((a||[]).map(s=>String(s||'').trim()).filter(Boolean)));
  const canon = s => String(s||'').normalize('NFKC').trim().toLowerCase().replace(/[‐‑–—]/g,'-').replace(/[\u2018\u2019\u201C\u201D]/g,"'").replace(/\s+/g,' ').replace(/[^\w\s\-&/()]/g,'');
  const ensureExactHeader = (sh, exact, synonyms=[]) => {
    const lastCol = sh.getLastColumn();
    const hdr = sh.getRange(1,1,1,Math.max(1,lastCol)).getValues()[0]||[];
    const map = {}; hdr.forEach((v,i)=> map[String(v||'').trim().toLowerCase()] = i+1);
    if (map[exact.toLowerCase()]) return map[exact.toLowerCase()];
    for (const s of synonyms) {
      const c = map[String(s||'').trim().toLowerCase()];
      if (c) { sh.getRange(1,c).setValue(exact); return c; }
    }
    const c = lastCol + 1; sh.getRange(1,c).setValue(exact); return c;
  };
  const parseTaskJSONFields = (j) => {
    let objs=[];
    try {
      const v = JSON.parse(String(j||'')||'');
      if (Array.isArray(v)) objs = v.filter(o=>o&&typeof o==='object');
      else if (v && typeof v==='object') objs=[v];
    } catch(_){}
    const normKey = k => String(k||'').toLowerCase().replace(/[\s_]/g,'').replace(/[^\w]/g,'');
    const pull = (keyNames) => {
      const out=[];
      objs.forEach(o=>{
        const km={}; Object.keys(o).forEach(k=> km[normKey(k)]=o[k]);
        for (const name of keyNames) {
          const v = km[normKey(name)];
          if (v!=null && String(v).trim()) { out.push(String(v).trim()); break; }
        }
      });
      return uniq(out).join('; ');
    };
    return {
      sub:  pull(['Sub-Category Name','Sub-Category','Task Bucket']),
      host: pull(['Host Escalation','Host_Escalation']),
      staff:pull(['Staff Requirements','Staff_Requirements','Requirements to complete task','Requirements']),
      guest:pull(['Guest Requirements','Guest_Requirements'])
    };
  };

  // --- read d:aiLog (source of task intents) ---
  const n = Math.max(0, logSh.getLastRow()-1);
  if (!n) return;
  const recipV = logSh.getRange(2, Hlog['Recipient Type'],   n, 1).getValues();
  const pidV   = logSh.getRange(2, Hlog['Property Id'],      n, 1).getValues();
  const toV    = logSh.getRange(2, Hlog['To'],               n, 1).getValues();
  const msgV   = logSh.getRange(2, Hlog['Message'],          n, 1).getValues(); // = Action Title
  const tjsonV = Hlog['Ticket Enrichment JSON'] ? logSh.getRange(2, Hlog['Ticket Enrichment JSON'], n, 1).getValues() : Array(n).fill(['']);
  const flagV  = logSh.getRange(2, Hlog['Task Created'],     n, 1).getValues();
  const uuidV  = logSh.getRange(2, Hlog['Task UUID'],        n, 1).getValues();
  const chainV = Hlog['Message Bundle UUID'] ? logSh.getRange(2, Hlog['Message Bundle UUID'], n, 1).getValues() : Array(n).fill(['']);
  const bookV  = Hlog['Booking Id'] ? logSh.getRange(2, Hlog['Booking Id'], n, 1).getValues() : Array(n).fill(['']);
  const bucketV= Hlog['Task Bucket'] ? logSh.getRange(2, Hlog['Task Bucket'], n, 1).getValues() : Array(n).fill(['']);
  const trqV   = Hlog['Task Request Title'] ? logSh.getRange(2, Hlog['Task Request Title'], n, 1).getValues() : Array(n).fill(['']);

  // --- aiTasks exact headers (create/rename to your labels) ---
  const T_CREATED    = ensureExactHeader(taskSh,'Created Date');
  const T_UUID       = ensureExactHeader(taskSh,'Task UUID');
  const T_PHONE      = ensureExactHeader(taskSh,'Phone');
  const T_PROPID     = ensureExactHeader(taskSh,'Property Id',['Property ID']);
  const T_BOOKID     = ensureExactHeader(taskSh,'Booking Id',['Booking ID','Reservation Id','Reservation ID']);

  const T_GUEST      = ensureExactHeader(taskSh,'Guest Message');           // = Action Title
  const T_ACTION     = ensureExactHeader(taskSh,'Action Title');
  const T_BUCKET     = ensureExactHeader(taskSh,'Task Bucket');
  const T_SUB        = ensureExactHeader(taskSh,'Sub-Category',['Sub Category','Sub-Category Name']); // mirror to exact label
  const T_REQTITLE   = ensureExactHeader(taskSh,'Task Request Title');

  const T_TASKJSON   = ensureExactHeader(taskSh,'Task JSON');               // NEW – full JSON from tasks! (A/B/E lookup)

  const T_STAFFID    = ensureExactHeader(taskSh,'Staff Id',['Staff ID']);
  const T_STAFFNAME  = ensureExactHeader(taskSh,'Staff Name');
  const T_STAFFJSON  = ensureExactHeader(taskSh,'Staff Details JSON');
  const T_STAFFPH    = ensureExactHeader(taskSh,'Staff Phone');

  const T_REQ_STAFF  = ensureExactHeader(taskSh,'Staff Requirements');
  const T_REQ_GUEST  = ensureExactHeader(taskSh,'Guest Requirements');
  const T_ESC_HOST   = ensureExactHeader(taskSh,'Host Escalation');

  const T_AH         = ensureExactHeader(taskSh,'Action Holder');
  const T_AH_NOTE    = ensureExactHeader(taskSh,'Action Holder Notified');
  const T_AH_MISS    = ensureExactHeader(taskSh,'Action Holder Missing Requirements');
  const T_AH_PHONE   = ensureExactHeader(taskSh,'Action Holder Phone');

  const T_HOST_NOTIF = ensureExactHeader(taskSh,'Host Notified');

  const T_STATUS     = ensureExactHeader(taskSh,'Status');
  const T_UUIDS      = ensureExactHeader(taskSh,'UUIDs');
  const T_CONV       = ensureExactHeader(taskSh,'On-going Conversation',['Ongoing Conversation']);

  // Owner/type maps
  const { typeMap, ownerMap, ownerMapByProp } = getCategoryInfoMaps();

  // Open-index to avoid duplicates per (Phone+Property+Bucket)
  const dataRows = Math.max(0, taskSh.getLastRow()-1);
  const openIndex = new Map();
  if (dataRows) {
    const phoneVals = taskSh.getRange(2, T_PHONE,  dataRows, 1).getValues();
    const propVals  = taskSh.getRange(2, T_PROPID, dataRows, 1).getValues();
    const buckVals  = taskSh.getRange(2, T_BUCKET, dataRows, 1).getValues();
    for (let i=0;i<dataRows;i++) {
      const key = `${String(phoneVals[i][0]||'').trim()}||${String(propVals[i][0]||'').trim()}`;
      const subs = String(buckVals[i][0]||'').split(/\s*,\s*/).map(canon).filter(Boolean);
      if (!openIndex.has(key)) openIndex.set(key, new Set());
      subs.forEach(s=> openIndex.get(key).add(s));
    }
  }
  const hasOpen = (phone, pid, buck) => {
    const set = openIndex.get(`${phone}||${pid}`); return !!(set && set.has(canon(buck)));
  };

  // find next blank row (reuse empties where Task UUID blank)
  const blankQueue = (() => {
    const q=[]; if (!dataRows) return q;
    const uuids = taskSh.getRange(2, T_UUID, dataRows, 1).getValues();
    for (let i=0;i<uuids.length;i++) if (!String(uuids[i][0]||'').trim()) q.push(i+2);
    return q;
  })();

  let appendStart = taskSh.getLastRow() + 1;

  for (let i = 0; i < n; i++) {
    const recip = String(recipV[i][0]||'').trim().toLowerCase();
    if (recip !== 'guest') continue;

    const already = String(flagV[i][0]||'').trim() || String(uuidV[i][0]||'').trim();
    if (already) continue;

    const propId     = String(pidV[i][0]||'').trim();
    const phone      = String(toV [i][0]||'').trim();
    const actionTitle= String(msgV[i][0]||'').trim();
    const chain      = String(chainV[i][0]||'').trim();
    let   bookingId  = String(bookV[i][0]||'').trim();
    if (!bookingId) { try { bookingId = lookupBookingIdByPhone_(ss, phone) || ''; } catch(_){} }

    // target buckets
    let bucket = String(bucketV[i][0]||'').trim();
    if (!bucket && tjsonV[i][0]) {
      try { const o=JSON.parse(String(tjsonV[i][0]||'')); if (o && o.TaskBucket) bucket=String(o.TaskBucket).trim(); } catch(_){}
    }
    if (!bucket) continue;

    const names = bucket.split(/\s*,\s*/).map(s=>s.trim()).filter(Boolean);
    const toCreate = names.filter(n => (!typeMap[canon(n)] || typeMap[canon(n)]==='task') && !hasOpen(phone, propId, n));
    if (!toCreate.length) continue;

    // bundle by staff owner & prepare Task JSONs per sub
    const byOwner = {};
    toCreate.forEach(subName => {
      const owner = ownerMapByProp[`${propId}||${canon(subName)}`] || ownerMap[canon(subName)] || { staffId:'', staffName:'', staffPhone:'', detailsJSON:'', req:'' };
      const key = `${owner.staffId}|${owner.staffPhone}|${owner.staffName}`;
      if (!byOwner[key]) byOwner[key] = { meta: owner, subs: [] };
      const tjson = getTaskJSONFromTasks_(propId, subName) || '';
      const fields = parseTaskJSONFields(tjson);
      byOwner[key].subs.push({ name: subName, json: tjson, fields });
    });

    const tids = [];
    Object.values(byOwner).forEach(group => {
      const writeRow = blankQueue.length ? blankQueue.shift() : (appendStart++);
      const tid = Utilities.getUuid();
      const cats = group.subs.map(s=>s.name);
      const allJSON = group.subs.map(s=> {
        try { return JSON.parse(s.json||''); } catch(_){ return s.json||''; }
      });
      // requirements (joined across subs)
      const staffReq  = uniq(group.subs.map(s=>s.fields.staff)).join('; ');
      const guestReq  = uniq(group.subs.map(s=>s.fields.guest)).join('; ');
      const hostEsc   = uniq(group.subs.map(s=>s.fields.host)).join('; ');

      // initial action holder & phone
      const holder = guestReq ? 'Guest' : 'Staff';
      const holderPhone = holder==='Guest' ? phone : (group.meta.staffPhone || '');

      // write row
      taskSh.getRange(writeRow, T_CREATED).setValue(new Date());
      taskSh.getRange(writeRow, T_UUID   ).setValue(tid);
      taskSh.getRange(writeRow, T_PHONE  ).setValue(phone);
      taskSh.getRange(writeRow, T_PROPID ).setValue(propId);
      taskSh.getRange(writeRow, T_BOOKID ).setValue(bookingId);

      taskSh.getRange(writeRow, T_GUEST  ).setValue(actionTitle);             // Guest Message = Action Title
      taskSh.getRange(writeRow, T_ACTION ).setValue(actionTitle);
      taskSh.getRange(writeRow, T_BUCKET ).setValue(cats.join(', '));
      taskSh.getRange(writeRow, T_SUB    ).setValue(cats.join(', '));         // Sub-Category mirror
      taskSh.getRange(writeRow, T_REQTITLE).setValue(String(trqV[i][0]||'').trim() || actionTitle || cats[0]);

      taskSh.getRange(writeRow, T_TASKJSON).setValue(allJSON.length===1 ? JSON.stringify(allJSON[0]) : JSON.stringify(allJSON));

      taskSh.getRange(writeRow, T_STAFFID  ).setValue(group.meta.staffId || '');
      taskSh.getRange(writeRow, T_STAFFNAME).setValue(group.meta.staffName || '');
      taskSh.getRange(writeRow, T_STAFFJSON).setValue(group.meta.detailsJSON || '');
      taskSh.getRange(writeRow, T_STAFFPH  ).setValue(group.meta.staffPhone || '');

      // Backfill requirements from Task JSON (source of truth)
      taskSh.getRange(writeRow, T_REQ_STAFF).setValue(staffReq || group.meta.req || '');
      taskSh.getRange(writeRow, T_REQ_GUEST).setValue(guestReq || '');
      taskSh.getRange(writeRow, T_ESC_HOST ).setValue(hostEsc  || '');

      taskSh.getRange(writeRow, T_AH      ).setValue(holder);
      taskSh.getRange(writeRow, T_AH_NOTE ).setValue(false);
      taskSh.getRange(writeRow, T_AH_MISS ).setValue(holder==='Guest' ? guestReq : staffReq);
      taskSh.getRange(writeRow, T_AH_PHONE).setValue(holderPhone);
      taskSh.getRange(writeRow, T_HOST_NOTIF).setValue(false);

      taskSh.getRange(writeRow, T_STATUS  ).setValue(holder==='Guest' ? 'Waiting on Guest' : 'Waiting on Staff');
      taskSh.getRange(writeRow, T_UUIDS   ).setValue(chain);

      // update de-dup index
      cats.forEach(c => {
        const key = `${phone}||${propId}`;
        if (!openIndex.has(key)) openIndex.set(key, new Set());
        openIndex.get(key).add(canon(c));
      });

      tids.push(tid);
    });

    if (tids.length) { flagV[i][0] = true; uuidV[i][0] = tids.join(','); }
  }

  logSh.getRange(2, Hlog['Task Created'], n, 1).setValues(flagV);
  logSh.getRange(2, Hlog['Task UUID'],    n, 1).setValues(uuidV);
}






/**
 * Task triage using a single prompt defined in prompts.gs.
 *
 * Requires PROMPT_TASK_TRIAGE in prompts.gs. It must return strict JSON:
 * {
 *   "host_escalation_needed": true|false,
 *   "host_reason": "<short reason>",
 *   "guest_info_needed": true|false,
 *   "guest_missing": "<what to ask guest>",
 *   "staff_info_needed": true|false,
 *   "staff_missing": "<what to ask staff>",
 *   "action_holder": "Host|Guest|Staff|None"
 * }
 *
 * Template placeholders filled:
 *  - HOST_ESCALATION_CRITERIA
 *  - TASK_SCOPE
 *  - STAFF_REQUIREMENTS
 *  - GUEST_REQUIREMENTS
 *  - GUEST_MESSAGE
 *  - STAFF_CONVERSATION
 */
function assessTaskInfoAndEscalation(apiKey, args) {
  const {
    hostEscCriteria = '',
    taskScope = '',
    guestMessage = '',
    staffConversation = '',
    staffRequirements = '',
    guestRequirements = ''
  } = args || {};

  const prompt = fillTpl_(PROMPT_TASK_TRIAGE, {
    HOST_ESCALATION_CRITERIA: String(hostEscCriteria || '(none)'),
    TASK_SCOPE:               String(taskScope || '(none)'),
    STAFF_REQUIREMENTS:       String(staffRequirements || '(none)'),
    GUEST_REQUIREMENTS:       String(guestRequirements || '(none)'),
    GUEST_MESSAGE:            String(guestMessage || '(none)'),
    STAFF_CONVERSATION:       String(staffConversation || '(none)')
  });

  try {
    const out = callOpenAIChat(prompt, apiKey); // expects parsed JSON
    const b = (v) => (typeof v === 'boolean') ? v : /^(true|yes|y|1)$/i.test(String(v||''));
    return {
      hostNeeded   : b(out?.host_escalation_needed),
      hostReason   : String(out?.host_reason || '').slice(0, 300),
      guestNeeded  : b(out?.guest_info_needed),
      guestMissing : String(out?.guest_missing || '').slice(0, 500),
      staffNeeded  : b(out?.staff_info_needed),
      staffMissing : String(out?.staff_missing || '').slice(0, 500),
      actionHolder : String(out?.action_holder || '').trim()
    };
  } catch (e) {
    Logger.log('assessTaskInfoAndEscalation error: ' + e);
    return { hostNeeded:false, hostReason:'', guestNeeded:false, guestMissing:'', staffNeeded:false, staffMissing:'', actionHolder:'' };
  }
}


function evaluateGuestRequirementsFromThread(guestRequirements, threadRaw, apiKey) {
  const prompt = fillTpl_(PROMPT_GUEST_REQUIREMENTS_EVAL, {
    GUEST_REQUIREMENTS: String(guestRequirements || '').trim() || '(none)',
    THREAD: String(threadRaw || '').trim() || '[]'
  });
  try {
    const out = callOpenAIChat(prompt, apiKey); // expects JSON per prompt
    const missing  = Array.isArray(out?.missing_items)  ? out.missing_items  : [];
    const provided = Array.isArray(out?.provided_items) ? out.provided_items : [];
    const all      = out?.satisfied_all === true;
    return { satisfiedAll: all, missingItems: missing, providedItems: provided, _debug: { raw: JSON.stringify(out).slice(0,2000) } };
  } catch (e) {
    Logger.log('evaluateGuestRequirementsFromThread error: ' + e);
    return { satisfiedAll: false, missingItems: [], providedItems: [], _debug: { raw: '' } };
  }
}

/** =========================================================
 * buildNextTaskMessage (heavy debug on STAFF_NAME fill)
 *   – REPLACE your existing function with this version.
 * ========================================================= */
// v3.1 — aiTasks send gate: send first message, then pause until “Response Received?” = TRUE.
//        Applies to both Staff and Guest. If a response hasn’t arrived, do not resend.
//        After response, only send if the new text differs from the existing “Ai Message Response”.
// v3.6 — Dynamic switch: after a response, evaluate if the guest already provided ALL required items
//        (any domain: time, quantity, type, etc.). If yes → actionHolder="Staff", guestInfoNeeded=false.
//        Keeps kickoff+pause gate and duplicate suppression.
// v3.8 — buildNextTaskMessage: dynamic, multilingual, NO regex heuristics
// - Sends kickoff once, then pauses until “Response Received?” = TRUE.
// - After any response, uses PROMPT_GUEST_REQUIREMENTS_EVAL on the thread to decide
//   if guest requirements are fully satisfied (any domain, any language).
//   If satisfied → actionHolder="Staff" and we message Staff; otherwise we ask Guest.
// - Duplicate-message suppression: after response, only send if new text differs
//   from the existing “Ai Message Response”.
// v4.0 — Dynamic, multilingual; no regex heuristics; richer debugging
// - Kickoff gate: send once, then wait for “Response Received?” before sending again
// - After any guest response, PROMPT_GUEST_REQUIREMENTS_EVAL decides if Guest reqs are satisfied
//   → if satisfied: actionHolder="Staff", guestInfoNeeded=false
// - TRIAGE prompt selects actionHolder with duplicate-guest-ask guard
// - Duplicate suppression: after response, only send if new text differs from existing
// - Writes audit columns: Guest Provided Items / Guest Missing Items
/* v4.1 — buildNextTaskMessage with:
   - guest-only evaluation thread
   - full prompt/response logging to d:debugAi (TRIAGE, GUEST_EVAL, DECISION)
   - duplicate-ask guard respected from triage JSON
   - gpt-5-mini-2025-08-07 model
 */
function buildNextTaskMessage() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('aiTasks');
  if (!sh) throw new Error('Sheet “aiTasks” not found');

  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');
  if (!PROMPT_GUEST_INFO_REQUEST || !PROMPT_STAFF_INFO_REQUEST || !PROMPT_GUEST_TASK_COMPLETED)
    throw new Error('Missing required prompts');

  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]||[];
  const H = {}; hdr.forEach((v,i)=> H[String(v||'').trim().toLowerCase()] = i+1);
  const col = (...names)=>{ for (const n of names){ const c=H[String(n).toLowerCase()]; if (c) return c; } return null; };
  const ensure = (name)=>{ const c=col(name); if (c) return c; const nc=sh.getLastColumn()+1; sh.getRange(1,nc).setValue(name); H[name.toLowerCase()]=nc; return nc; };
  const truthy = v => (typeof v==='boolean') ? v : /^true$/i.test(String(v||'').trim());
  const sameMsg = (a,b)=> String(a||'').replace(/\s+/g,' ').trim() === String(b||'').replace(/\s+/g,' ').trim();
  const guestOnly = (raw) => extractGuestOnlyForEval_(raw);

  const C = {
    uuid   : col('task uuid') || 2,
    propId : col('property id') || 4,
    guestPhone : col('phone') || 3,
    action : col('guest message','action title') || 5,
    bucket : col('task bucket','sub-category','sub category') || 6,
    taskJSON: col('task json') || ensure('Task JSON'),
    staffJSON: col('staff details json') || 8,
    staffPhone: col('staff phone') || 9,
    staffName : col('staff name'),
    hostEsc   : col('host escalation'),
    reqStaff  : col('staff requirements'),
    reqGuest  : col('guest requirements'),
    uuids     : col('uuids') || 11,
    conv      : col('on-going conversation','ongoing conversation') || 12,
    out       : col('ai message response','message out') || 13,
    respFlag  : col('response recieved?','response received?'),
    ah        : col('action holder') || ensure('Action Holder'),
    ahNotified: col('action holder notified') || ensure('Action Holder Notified'),
    ahMissing : col('action holder missing requirements') || ensure('Action Holder Missing Requirements'),
    ahPhone   : col('action holder phone') || ensure('Action Holder Phone'),
    status    : col('status') || ensure('Status')
  };

  const n = Math.max(0, sh.getLastRow()-1); if (!n) return;
  const get = (c)=> sh.getRange(2,c,n,1).getValues();

  const vUUID=get(C.uuid), vPID=get(C.propId), vGPH=get(C.guestPhone), vACT=get(C.action), vBUK=get(C.bucket),
        vJS=get(C.taskJSON), vSJSON=get(C.staffJSON), vSPH=get(C.staffPhone), vSN=C.staffName?get(C.staffName):Array(n).fill(['']),
        vHOST=C.hostEsc?get(C.hostEsc):Array(n).fill(['']), vRS=C.reqStaff?get(C.reqStaff):Array(n).fill(['']), vRG=C.reqGuest?get(C.reqGuest):Array(n).fill(['']),
        vUUIDs=get(C.uuids), vCONV=get(C.conv), vOUT=get(C.out), vRESP=C.respFlag?get(C.respFlag):Array(n).fill(['']),
        vAH=get(C.ah), vAHN=get(C.ahNotified), vAHM=get(C.ahMissing), vAHP=get(C.ahPhone), vSTAT=get(C.status);

  const parseTaskJSONFields = (j) => {
    let objs=[]; try { const v=JSON.parse(String(j||'')); objs=Array.isArray(v)?v.filter(o=>o&&typeof o==='object'):(v&&typeof v==='object')?[v]:[]; } catch(_){}
    const nk = k => String(k||'').toLowerCase().replace(/[\s_]/g,'').replace(/[^\w]/g,'');
    const pull = (keys)=> {
      const out=[]; objs.forEach(o=>{ const m={}; Object.keys(o).forEach(k=>m[nk(k)]=o[k]); for (const k of keys){ const v=m[nk(k)]; if (v!=null && String(v).trim()){ out.push(String(v).trim()); break; } } });
      return out.join('; ');
    };
    return {
      host : pull(['Host Escalation','Host_Escalation']),
      staff: pull(['Staff Requirements','Staff_Requirements','Requirements to complete task','Requirements']),
      guest: pull(['Guest Requirements','Guest_Requirements'])
    };
  };

  let any=false;

  for (let i=0;i<n;i++) {
    const tid = String(vUUID[i][0]||'').trim(); if (!tid) continue;
    const pid = String(vPID [i][0]||'').trim();
    const gph = String(vGPH [i][0]||'').trim();
    const act = String(vACT [i][0]||'').trim();
    const buk = String(vBUK [i][0]||'').trim() || 'Task';
    const conv= String(vCONV[i][0]||'').trim() || '[]';
    const chain=String(vUUIDs[i][0]||'').trim();

    const existingOut  = String(vOUT[i][0]||'').trim();
    const hasKickoff   = existingOut.length > 0;
    const respReceived = truthy(vRESP[i][0]);

    // Requirements (Task JSON is source of truth; fallback to columns)
    const tf = parseTaskJSONFields(vJS[i][0]);
    const hostEsc  = tf.host  || String(vHOST[i][0]||'').trim();
    const staffReq = tf.staff || String(vRS  [i][0]||'').trim();
    const guestReq = tf.guest || String(vRG  [i][0]||'').trim();

    // Completed → notify guest via AH phone (guest)
    const isCompleted = /^completed$/i.test(String(vSTAT[i][0]||'').trim());
    if (isCompleted && !truthy(vAHN[i][0])) {
        let lang='en'; try { lang = LanguageApp.detectLanguage(act || conv || '') || 'en'; } catch(_){}
        const prompt = fillTpl_(PROMPT_GUEST_TASK_COMPLETED, {
        LANG: lang, GUEST_MESSAGE: act || '(none)', THREAD_CONTEXT: conv, TASK_JSON: String(vJS[i][0]||'')
        });
        let txt=''; try { txt = callGPTTurbo([{role:'user',content:prompt}], apiKey).trim(); } catch(_){}
        if (txt) {
        vOUT[i][0]=txt; vAH[i][0]='Guest'; vAHN[i][0]=true; vAHM[i][0]=''; vAHP[i][0]=gph; any=true;
        appendOutboundToAiLog({
          recipientType:'Guest', propertyId: pid, to: gph,
          originalMessage: act, message: act,
          aiMessageResponse: txt, status:'Success', taskUuid: tid, messageChainUUIDs: chain
        });
      }
      continue;
    }

    // Kickoff gate
    if (hasKickoff && !respReceived) continue;

    // Evaluate guest requirements on guest-only thread
    let satisfiedAll = false;
    try {
      const ev = evaluateGuestRequirementsFromThread(guestReq || '', guestOnly(conv), apiKey);
      satisfiedAll = !!ev.satisfiedAll;
    } catch(_) {}

    // Triage (but Host only if explicitly needed)
    let tri = {};
    try {
      const triPrompt = fillTpl_(PROMPT_TASK_TRIAGE, {
        TASK_SCOPE: buk, TASK_JSON: String(vJS[i][0]||''),
        HOST_ESCALATION_CRITERIA: hostEsc || '',
        GUEST_REQUIREMENTS: guestReq || '',
        STAFF_REQUIREMENTS: staffReq || '',
        STAFF_CONVERSATION: conv,
        GUEST_MESSAGE: act
      });
      const triRes = openAIChatJSON_(triPrompt, apiKey, 'gpt-5-mini-2025-08-07');
      tri = (triRes && triRes.json && typeof triRes.json==='object') ? triRes.json : {};
    } catch(_){}

    // Decide Action Holder (priority: Guest satisfied → Staff; else Guest if missing; Host only if triage says needed)
    let holder = 'Guest';
    if (satisfiedAll) holder = 'Staff';
    else if ((guestReq||'').trim()) holder = 'Guest';
    if (tri && tri.hostNeeded === true && holder !== 'Staff') holder = 'Host';

    // Resolve AH phone
    const sName = String(vSN[i][0]||'').trim();
    const sPh   = String(vSPH[i][0]||'').trim();
    const hostPh= getHostPhoneByPropertyId(pid) || '';
    const toNum = holder==='Guest' ? gph : holder==='Staff' ? sPh : hostPh;

    // Persist AH + phone + status + missing
    vAH[i][0]  = holder;
    vAHP[i][0] = toNum;
    vAHM[i][0] = (holder==='Guest') ? (guestReq||'') : (holder==='Staff' ? (staffReq||'') : (hostEsc||''));
    vSTAT[i][0]= holder==='Guest' ? 'Waiting on Guest' : holder==='Staff' ? 'Waiting on Staff' : 'Waiting on Host';
    any=true;

    if (holder === 'Host') {
      // Do NOT send here; host escalation is handled by processHostEscalationsFromAiTasks()
      continue;
    }

    if (holder === 'Guest') {
      let lang='en'; try { lang = LanguageApp.detectLanguage(act) || 'en'; } catch(_){}
      const prompt = fillTpl_(PROMPT_GUEST_INFO_REQUEST, {
        LANG: lang, TASK_SCOPE: buk, TASK_JSON: String(vJS[i][0]||''),
        GUEST_REQUIREMENTS: guestReq || '(none)', THREAD_CONTEXT: conv
      });
      const res = openAIChatJSON_(prompt, apiKey, 'gpt-5-mini-2025-08-07');
      let txt = (res && res.raw) ? res.raw.trim() : '';
      if (!txt) continue;
      if (hasKickoff && respReceived && sameMsg(txt, existingOut)) continue;

      vOUT[i][0]=txt; vAHN[i][0]=true; any=true;
      appendOutboundToAiLog({
        recipientType:'Guest', propertyId: pid, to: (vAHP[i][0]||gph),
        originalMessage: act, message: act,
        aiMessageResponse: txt, status:'Success', taskUuid: tid, messageChainUUIDs: chain
      });
      continue;
    }

    // Staff branch
      const sJson = String(vSJSON[i][0]||'').trim();
      const sLang = (function(){ try{ const o=JSON.parse(sJson||'{}'); return o.preferred_language||o.language||o.lang||'en'; }catch(_){ return 'en'; }})();
    const first = (sName||'').split(/\s+/)[0] || 'there';
    const latestStaffInbound = (function(raw){
      try { const a=JSON.parse(raw||'[]'); if (Array.isArray(a)) for (let j=a.length-1;j>=0;j--){ const s=String(a[j]||''); if (/Staff:/i.test(s)) return s.replace(/^.*Staff:\s*/i,'').trim(); } } catch(_){}
      const lines=String(raw||'').split(/\r?\n/).filter(Boolean); for (let j=lines.length-1;j>=0;j--){ const s=String(lines[j]||''); if (/Staff:/i.test(s)) return s.replace(/^.*Staff:\s*/i,'').trim(); }
      return '';
    })(conv);

    const sPrompt = fillTpl_(PROMPT_STAFF_INFO_REQUEST, {
      STAFF_LANG: sLang, STAFF_NAME:first, TASK_SCOPE: buk, TASK_JSON: String(vJS[i][0]||''),
      STAFF_REQUIREMENTS: staffReq || '(none)', LATEST_STAFF_INBOUND: latestStaffInbound || '(not found)',
      STAFF_CONVERSATION: conv, GUEST_CONTEXT: `Guest request/context: ${act||'(none)'}`, THREAD_CONTEXT: conv
    });
    const sRes = openAIChatJSON_(sPrompt, apiKey, 'gpt-5-mini-2025-08-07');
      let txt = (sRes && sRes.raw) ? sRes.raw.trim() : '';
      if (!txt) continue;
    if (!/^Staff:/i.test(txt)) txt = `Staff: Hi ${first} — ${txt}`;
    txt = txt.replace(/^Staff:\s*Hi\s+([^—-]+)[—-]\s*/i, `Staff: Hi ${first} — `);
      if (hasKickoff && respReceived && sameMsg(txt, existingOut)) continue;

    vOUT[i][0]=txt; vAHN[i][0]=true; any=true;
    appendOutboundToAiLog({
      recipientType:'Staff', propertyId: pid, to: (vAHP[i][0]||sPh),
      originalMessage: latestStaffInbound || act, message: act,
      aiMessageResponse: txt, status:'Success', taskUuid: tid, messageChainUUIDs: chain
    });
  }

  if (any) {
    sh.getRange(2, C.out,     n,1).setValues(vOUT);
    sh.getRange(2, C.ah,      n,1).setValues(vAH);
    sh.getRange(2, C.ahNotified, n,1).setValues(vAHN);
    sh.getRange(2, C.ahMissing,  n,1).setValues(vAHM);
    sh.getRange(2, C.ahPhone,    n,1).setValues(vAHP);
    sh.getRange(2, C.status,     n,1).setValues(vSTAT);
  }
}








/** =========================================================================
 *  Misc helpers: extract inbound + OpenAI wrappers
 *  ========================================================================= */
function extractLatestInboundAndOutstanding(convRaw, requirements) {
  let latestStaffInbound = '';
  try {
    const arr = JSON.parse(convRaw);
    if (Array.isArray(arr)) {
      for (let j = arr.length - 1; j >= 0; j--) {
        const s = String(arr[j] || '');
        if (/Staff:/i.test(s)) { latestStaffInbound = s.replace(/^.*Staff:\s*/i, '').trim(); break; }
      }
    }
  } catch (_) {
    const m = String(convRaw).split(/\n|\r/).filter(Boolean);
    for (let j = m.length - 1; j >= 0; j--) {
      const s = String(m[j] || '');
      if (/Staff:/i.test(s)) { latestStaffInbound = s.replace(/^.*Staff:\s*/i, '').trim(); break; }
    }
  }
  const outstanding = String(requirements || '').trim();
  return { latestStaffInbound, outstanding };
}

function callOpenAIChat(prompt, apiKey, model) {
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method:'post',
    contentType:'application/json',
    headers:{ Authorization:`Bearer ${apiKey}` },
    payload: JSON.stringify({
      model: model || OPENAI_MODEL,
      messages:[{role:'user',content:prompt}]
    }),
    muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
  const body = JSON.parse(res.getContentText());
  const content = body.choices[0].message.content.trim();
  try { return JSON.parse(content); } catch (_){}
  const s = content.indexOf('{'); const e = content.lastIndexOf('}') + 1;
  if (s >= 0 && e > s) return JSON.parse(content.slice(s,e));
  throw new Error('Unable to parse JSON from model response.');
}

function callGPTTurbo(messages, apiKey, model) {
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method:'post',
    contentType:'application/json',
    headers:{ Authorization:`Bearer ${apiKey}` },
    payload: JSON.stringify({
      model: model || OPENAI_MODEL,
      messages
    }),
    muteHttpExceptions:true
  });
  if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
  const data = JSON.parse(res.getContentText());
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function findMatchingOpenTaskUUID(phone, propertyId, canonSubs) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('aiTasks');
  if (!sh) return '';

  const H = (function () {
    const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] || [];
    const m = {}; hdr.forEach((v,i)=> m[String(v||'').trim().toLowerCase()] = i+1);
    return m;
  })();

  const cPhone = H['phone'], cProp = H['property id'] || H['property id'], cSub = H['sub-category'] || H['sub category'];
  const cUUID  = H['task uuid'], cStatus = H['status'];
  if (!cPhone || !cProp || !cSub || !cUUID) return '';

  const last = sh.getLastRow();
  for (let r = last; r >= 2; r--) {
    const ph  = String(sh.getRange(r, cPhone).getValue() || '').trim();
    const pid = String(sh.getRange(r, cProp ).getValue() || '').trim();
    const sub = String(sh.getRange(r, cSub  ).getValue() || '').trim();
    const ok  = !cStatus ? true : String(sh.getRange(r, cStatus).getValue() || '').toUpperCase() !== 'TRUE';
    if (!ok) continue;
    if (ph !== String(phone||'').trim()) continue;
    if (pid !== String(propertyId||'').trim()) continue;

    const rowSubsCanon = sub.split(/\s*,\s*/).map(s => _canonLabel_(s)).filter(Boolean);
    if (rowSubsCanon.some(s => canonSubs.includes(s))) {
      return String(sh.getRange(r, cUUID).getValue() || '').trim();
    }
  }
  return '';
}



/** =========================================================================
 *  Debug Menu
 *  ========================================================================= */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AI Debug')
    .addItem('Validate source tabs', 'dbgValidateSheets')
    .addItem('Inspect aiResponse row…', 'dbgInspectRowPrompt')
    .addItem('List categories for Property Id…', 'dbgListCatsPrompt')
    .addToUi();
}

function dbgValidateSheets() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ui  = SpreadsheetApp.getUi();
  const out = [];

  function check(name, required) {
    const sh = ss.getSheetByName(name);
    if (!sh) { out.push(`✗ ${name} – sheet not found`); return; }
    const m = _ciHeaderMap(sh);
    const missing = required.filter(h => !_findCol(m, [h]));
    const rows = Math.max(0, sh.getLastRow() - 1);
    out.push(`${missing.length ? '✗' : '✓'} ${name}: ${rows} data rows; missing headers: [${missing.join(', ')}]`);
  }

  check('faqs',  ['json','property id','sub-category name']);
  check('tasks', ['json','property id','sub-category name','requirements to complete task']);
  check('d:bookingInfo',  ['json','property id']);
  check('d:propertyInfo', ['json','booking id']);

  Logger.log(out.join('\n'));
  ui.alert('Validate source tabs', out.join('\n'), ui.ButtonSet.OK);
}

function dbgListCatsPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('List categories for Property Id', 'Enter Property Id (exact):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pid = res.getResponseText().trim();
  dbgListCatsForProperty(pid);
}

function dbgListCatsForProperty(propertyId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('debug:categories') || ss.insertSheet('debug:categories');
  sh.clear();
  sh.getRange(1,1,1,6).setValues([['Property Id','Type','Sub-Category','Staff Id','Staff Name','Staff Phone']]);

  const { FAQS_LIST, TASK_LIST } = getCategoryListsForProperty(propertyId);
  const { typeMap, ownerMap }    = getCategoryInfoMaps();

  const rows = [];
  const faqSubs  = (FAQS_LIST ? FAQS_LIST.split(/\s*,\s*/) : []).map(s => s.trim()).filter(Boolean);
  const taskSubs = (TASK_LIST ? TASK_LIST.split(/\s*,\s*/) : []).map(s => s.trim()).filter(Boolean);

  faqSubs.forEach(s => rows.push([propertyId, 'faq', s, '', '', '']));
  taskSubs.forEach(s => {
    const o = ownerMap[_canonLabel_(s)] || {};
    rows.push([propertyId, 'task', s, o.staffId||'', o.staffName||'', o.staffPhone||'']);
  });

  if (rows.length) sh.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  Logger.log(`Categories for ${propertyId}\nFAQs: ${FAQS_LIST}\nTasks: ${TASK_LIST}`);
}

function dbgInspectRowPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Inspect aiResponse row', 'Enter row number (2..n):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const row = parseInt(res.getResponseText(), 10);
  if (!row || row < 2) { ui.alert('Invalid row number.'); return; }
  dbgInspectRow(row);
}

function dbgInspectRow(row) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const src     = ss.getSheetByName('aiResponse');
  if (!src) throw new Error('aiResponse not found');

  const H = _ciHeaderMap(src);
  const cPID   = _findCol(H, ['property id']);
  const cBID   = _findCol(H, ['booking id','reservation id']);
  const cMSG   = _findCol(H, ['message','inbound message']);
  const cPText = _findCol(H, ['property details']); // optional free text

  const val = (c) => c ? String(src.getRange(row, c).getValue() || '').trim() : '';

  const propertyId = val(cPID);
  const bookingId  = val(cBID);
  const message    = src.getRange(row, cMSG).getValue();  // keep raw
  const propText   = val(cPText);

  // Context lookups
  const bookingJSON  = _lookupSingleJSONByKey_('d:bookingInfo',  'property id', 'json', propertyId);
  const propInfoJSON = _lookupSingleJSONByKey_('d:propertyInfo', 'booking id',  'json', bookingId);
  const faqsJSONArr  = _lookupJSONArrayByKey_('faqs',            'property id', 'json', propertyId);

  // Category lists + allowed set
  const { FAQS_LIST, TASK_LIST, allowedSet, F, T } = getCategoryListsForProperty(propertyId);

  // Build the exact prompt we will send
  const prompt = fillTpl_(PROMPT_ENRICHMENT_CLASSIFY_JSON, {
    FAQS_LIST            : (FAQS_LIST || 'Other'),
    TASK_LIST            : (TASK_LIST || 'Other'),
    BOOKING_DETAILS_JSON : bookingJSON || '(none)',
    PROP_DETAILS         : propText || '(none)',
    PROPERTY_DETAILS_JSON: propInfoJSON || '(none)',
    PROP_FAQS_JSON       : faqsJSONArr || '[]',
    INSERT_GUEST_MESSAGE_HERE: String(message)
  });

  // Write to a debug sheet
  const dbg = ss.getSheetByName('debug:enrichment') || ss.insertSheet('debug:enrichment');
  dbg.clear();
  dbg.getRange(1,1,1,2).setValues([['Field','Value']]);

  const rows = [
    ['Row', row],
    ['Property Id', propertyId],
    ['Booking Id', bookingId],
    ['Message (raw)', typeof message === 'string' ? message : JSON.stringify(message)],
    ['Property Details (text)', propText],
    ['Booking Details JSON (len)', (bookingJSON||'').length],
    ['Property Details JSON (len)', (propInfoJSON||'').length],
    ['Property FAQs JSON (len)', (faqsJSONArr||'[]').length],
    ['FAQs List', FAQS_LIST],
    ['Tasks List', TASK_LIST],
    ['Allowed Set Size', Array.from(allowedSet).length],
    ['Per‑Prop FAQs Count', (F.perProp||[]).length],
    ['Per‑Prop Tasks Count', (T.perProp||[]).length],
    ['Global FAQs Count', (F.global||[]).length],
    ['Global Tasks Count', (T.global||[]).length],
    ['Prompt (full)', prompt]
  ];
  dbg.getRange(2,1,rows.length,2).setValues(rows);

  Logger.log('=== aiResponse Row Inspect ===');
  rows.forEach(([k,v]) => Logger.log(`${k}: ${String(v).slice(0, 400)}`));
  SpreadsheetApp.getUi().alert('Debug row written to sheet: debug:enrichment');
}

function sendWhatsApp() {
  const sid  = PropertiesService.getScriptProperties().getProperty('TWILIO_ACCOUNT_SID');
  const auth = PropertiesService.getScriptProperties().getProperty('TWILIO_AUTH_TOKEN');
  if (!sid || !auth) { return; }

  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const execSh = ss.getSheetByName('execution');
  const schedSh= ss.getSheetByName('scheduled');
  const msgSh  = ss.getSheetByName('d:messageLog');
  if (!msgSh) { return; }

  // --- helpers
  const norm = s => String(s||'')
    .replace(/[\u2018\u2019\u201C\u201D]/g,"'")
    .normalize('NFKC').trim().replace(/\s+/g,' ')
    .toLowerCase().replace(/[?:.,;—–-]/g,'');
  const headerMap = (sh) => {
    const row = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0] || [];
    const m = {}; row.forEach((h,i)=>{ const n = norm(h); if (n && !m[n]) m[n]=i+1; });
    return m;
  };
  const pick = (map, alts) => { for (const a of alts){ const idx = map[norm(a)]; if (idx) return idx; } return null; };
  const toWa = (from, to) => (/^whatsapp:/i.test(from) && !/^whatsapp:/i.test(to)) ? 'whatsapp:' + to.replace(/^whatsapp:/i,'').trim() : to;

  // --- d:messageLog targets (DO NOT add new columns)
  const Hl = headerMap(msgSh);
  const C_UUID   = pick(Hl, ['Message UUID']) || pick(Hl, ['UUID','SID','Message SID']) || 1;
  const C_DATE   = pick(Hl, ['Date','Timestamp']) || 2;
  const C_FROM   = pick(Hl, ['From']) || 3;
  const C_TO     = pick(Hl, ['To'])   || 4;
  const C_MSG    = pick(Hl, ['Message','Body']) || 5;
  const C_IMG    = pick(Hl, ['Image URL','Media URL']); // optional
  const C_TYPE   = pick(Hl, ['Type']);
  const C_REFMSG = pick(Hl, ['Reference Message UUIDs','Reference Message Response','Message Chain UUIDs']);
  const C_REFTSK = pick(Hl, ['Reference Message UUIDs (Tasks)','Task UUIDs','Task UUID']);
  const C_BOOK   = pick(Hl, ['Booking Id','Booking ID','Reservation Id','Reservation ID']);
  const C_EUUID  = pick(Hl, ['Ai Enrichment UUID','AI Enrichment UUID','Enrichment UUID']) || 10;
  const C_REQROLE= pick(Hl, ['Requestor Role','Requester Role','RequestorRole','RequesterRole']) || 21; // U by default

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  // --- replace the inner helper in sendWhatsApp() ---
  // --- replace the inner helper in sendWhatsApp() ---
    function appendMessageLog({ sidSM, from, to, body, typ, refMsg, refTask, euid, bookingId }) {
      const ss    = SpreadsheetApp.getActiveSpreadsheet();
      const msgSh = ss.getSheetByName('d:messageLog');
    if (!msgSh) return;

      // headers (case-insensitive)
      const norm = s => String(s||'').replace(/[\u2018\u2019\u201C\u201D]/g,"'")
        .normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ').replace(/[?:.,;—–-]/g,'');
    const H = (() => {
      const r = msgSh.getRange(1,1,1,msgSh.getLastColumn()).getValues()[0] || [];
      const m = {}; r.forEach((h,i)=>{ const n = norm(h); if (n && !m[n]) m[n]=i+1; }); return m;
    })();
      const pick = (...alts)=>{ for (const a of alts){ const c=H[norm(a)]; if (c) return c; } return null; };

      const C_UUID   = pick('Message UUID') || pick('UUID','SID','Message SID') || 1;
      const C_DATE   = pick('Date','Timestamp') || 2;
      const C_FROM   = pick('From') || 3;
      const C_TO     = pick('To')   || 4;
      const C_MSG    = pick('Message','Body') || 5;
      const C_IMG    = pick('Image URL','Media URL');
      const C_TYPE   = pick('Type');
      const C_REFMSG = pick('Reference Message UUIDs','Reference Message Response','Message Chain UUIDs');
      const C_REFTSK = pick('Reference Message UUIDs (Tasks)','Task UUIDs','Task UUID');
      const C_BOOK   = pick('Booking Id','Booking ID','Reservation Id','Reservation ID');
      const C_EUUID  = pick('Ai Enrichment UUID','AI Enrichment UUID','Enrichment UUID');
      const C_REQROLE= pick('Requestor Role','Requester Role','RequestorRole','RequesterRole');
      const C_PROP   = pick('Property Id','Property ID');  // K
      const C_STAFF  = pick('Staff Id','Staff ID');        // N

      const lastCol   = msgSh.getLastColumn();
      const targetRow = msgSh.getLastRow() + 1;
    const out = Array(lastCol).fill('');

      // Booking Id: prefer provided, else by 'to' phone
      let finalBookingId = String(bookingId || '').trim();
    if (!finalBookingId && C_BOOK) {
        try { finalBookingId = lookupBookingIdByPhone_(ss, to) || ''; } catch (_) {}
    }

      // Property Id: prefer via booking, else via staff
    let propertyId = '';
      try {
        if (finalBookingId) propertyId = lookupPropertyIdByBookingId_(ss, finalBookingId) || '';
      } catch (_) {}
    let staffRec = null;
    try {
      staffRec = lookupStaffRecordByPhone_(ss, to);
        if (!staffRec || staffRec.role === 'Guest') {
          const srFrom = lookupStaffRecordByPhone_(ss, from);
          if (srFrom && srFrom.role !== 'Guest') staffRec = srFrom;
        }
      if (!propertyId && staffRec && staffRec.pid) propertyId = staffRec.pid;
      } catch (_) {}

      // Staff Id if any staff phone matched
      const staffId = (staffRec && staffRec.staffId) ? staffRec.staffId : '';

      // write row
    const set = (c,v)=>{ if (c && c<=lastCol) out[c-1]=v; };
      set(C_UUID,  sidSM);
      set(C_DATE,  new Date());
      set(C_FROM,  from);
      set(C_TO,    to);
      set(C_MSG,   body || '');
      if (C_IMG)   set(C_IMG,  '');
      if (C_TYPE)  set(C_TYPE, typ || 'Outbound');
      if (C_REFMSG)set(C_REFMSG, refMsg || '');
      if (C_REFTSK)set(C_REFTSK, refTask || '');
      if (C_BOOK)  set(C_BOOK,  finalBookingId || '');
      if (C_EUUID) set(C_EUUID, euid || '');
      if (C_PROP)  set(C_PROP,  propertyId || '');
      if (C_STAFF) set(C_STAFF, staffId || '');

      msgSh.getRange(targetRow, 1, 1, lastCol).setValues([out]);
    SpreadsheetApp.flush();

      // optional: let existing ARRAYFORMULAs fill Requestor Role if present
      let requestorRole = '';
      if (C_REQROLE) {
        const maxMs=8000, step=400;
        for (let t=0; t<maxMs; t+=step) {
          requestorRole = String(msgSh.getRange(targetRow, C_REQROLE).getDisplayValue() || '').trim();
          if (requestorRole) break;
          Utilities.sleep(step); SpreadsheetApp.flush();
        }
      }

      // webhook (prop/staff kept in raw_data)
    try {
      sendMessageLogToWebhook({
          sidSM, from, to, body, typ: (typ||'Outbound'),
          refMsg, refTask, euid,
        bookingId: finalBookingId || '',
          requestorRole,
          propertyId, staffId,
          sheetRow: targetRow
        });
      } catch (err) {
        Logger.log('[appendMessageLog] webhook error: ' + err);
      }
    }



  // --- PROCESS: execution (Body-based)
  if (execSh) {
    const Hx = headerMap(execSh);
    const COL_BODY = pick(Hx, ['Body','Message','Ai Message Response','AI Message Response']);
    const COL_TO   = pick(Hx, ['To','To Number','WhatsApp To']);
    const COL_FROM = pick(Hx, ['From','From Number','WhatsApp From']);
    const COL_RTYPE = pick(Hx, ['Recipient Type']);
    const COL_REFMSG = pick(Hx, ['Reference Message UUIDs','Reference Message Response','Message Chain UUIDs','UUIDs']);
    const COL_REFTSK = pick(Hx, ['Reference Task UUIDs','Task UUIDs','Task UUID']);
    const COL_EUUID  = pick(Hx, ['Ai Enrichment UUID','AI Enrichment UUID','Enrichment UUID']) || 2;
    const COL_TYPE   = pick(Hx, ['Type']);
    if (COL_BODY && COL_TO && COL_FROM) {
      const startRow = 2, lastRow = execSh.getLastRow();
      if (lastRow >= startRow) {
        const values = execSh.getRange(startRow, 1, lastRow - startRow + 1, execSh.getLastColumn()).getValues();
        values.forEach(row => {
          const body = String(row[COL_BODY - 1] || '').trim();
          let   to   = String(row[COL_TO   - 1] || '').trim();
          let from = String(row[COL_FROM - 1] || '').trim();
            if (!from) {
              const rtype = COL_RTYPE ? String(row[COL_RTYPE - 1] || '').trim() : '';
              from = getDefaultFrom_(rtype);
            }

          const refM = COL_REFMSG ? String(row[COL_REFMSG - 1] || '').trim() : '';
          const refT = COL_REFTSK ? String(row[COL_REFTSK - 1] || '').trim() : '';
          const euid = String(row[COL_EUUID  - 1] || '').trim();
          const typ  = (COL_TYPE ? String(row[COL_TYPE - 1] || '').trim() : '') || 'Outbound';
          if (!to || !from || !body) return;
          to = toWa(from, to);

          let msgSid = '';
          try {
            const res = UrlFetchApp.fetch(url, {
              method : 'post',
              payload: { To: to, From: from, Body: body },
              headers: {
                Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + auth),
                'Content-Type':'application/x-www-form-urlencoded'
              },
              muteHttpExceptions: true
            });
            if (res.getResponseCode() !== 201) return;
            msgSid = JSON.parse(res.getContentText()).sid; // SM...
          } catch (_) { return; }

          appendMessageLog({ sidSM: msgSid, from, to, body, typ, refMsg: refM, refTask: refT, euid, bookingId: '' });
        });
      }
    }
  }

  // --- PROCESS: scheduled (ContentSid-based)
  if (schedSh) {
    const Hs = headerMap(schedSh);
    const COL_PROP = pick(Hs, ['Property Id','Property ID']);
    const COL_BOOK = pick(Hs, ['Booking Id','Booking ID','Reservation Id','Reservation ID']);
    const COL_CSID = pick(Hs, ['Message SID','ContentSid','Content SID']);
    const COL_TO   = pick(Hs, ['To','To Number','WhatsApp To']);
    const COL_FROM = pick(Hs, ['From','From Number','WhatsApp From']);
    const COL_VARNAME = pick(Hs, ['Variable: {{name}}','Variable {{name}}','Name']);

    if (COL_TO && COL_FROM && COL_CSID) {
      const startRow = 2, lastRow = schedSh.getLastRow();
      if (lastRow >= startRow) {
        const values = schedSh.getRange(startRow, 1, lastRow - startRow + 1, schedSh.getLastColumn()).getValues();
        values.forEach(row => {
          const contentSid = String(row[COL_CSID - 1] || '').trim();
          let   to         = String(row[COL_TO   - 1] || '').trim();
          const from       = String(row[COL_FROM - 1] || '').trim();
          const bookingId  = COL_BOOK ? String(row[COL_BOOK - 1] || '').trim() : '';
          const varName    = COL_VARNAME ? String(row[COL_VARNAME - 1] || '').trim() : '';
          if (!to || !from || !contentSid) return;
          to = toWa(from, to);

          const vars = varName ? JSON.stringify({ name: varName }) : '{}';

          let msgSid = '';
          try {
            const res = UrlFetchApp.fetch(url, {
              method : 'post',
              payload: {
                To: to,
                From: from,
                ContentSid: contentSid,
                ContentVariables: vars
              },
              headers: {
                Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + auth),
                'Content-Type':'application/x-www-form-urlencoded'
              },
              muteHttpExceptions: true
            });
            if (res.getResponseCode() !== 201) return;
            msgSid = JSON.parse(res.getContentText()).sid; // SM...
          } catch (_) { return; }

          appendMessageLog({
            sidSM: msgSid,
            from,
            to,
            body: '',
            typ: 'Scheduled',
            refMsg: `ContentSid:${contentSid}`,
            refTask: '',
            euid: '',
            bookingId
          });
        });
      }
    }
  }
}

/** d:bookingInfo: booking id → property id. */
function lookupPropertyIdByBookingId_(ss, bookingId) {
  const sh = ss.getSheetByName('d:bookingInfo');
  if (!sh || !bookingId) return '';
  const H = (function(){ const r=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]||[];
    const m={}; r.forEach((h,i)=> m[String(h||'').trim().toLowerCase()] = i+1); return m; })();
  const cBid = H['booking id'] || H['reservation id'] || 2;
  const cPid = H['property id'] || 3;
  const last = sh.getLastRow(); if (last < 2) return '';
  const n = last - 1;
  const bids = sh.getRange(2, cBid, n, 1).getValues();
  const pids = sh.getRange(2, cPid, n, 1).getValues();
  const want = String(bookingId||'').trim();
  for (let i = n-1; i >= 0; i--) {
    if (String(bids[i][0]||'').trim() === want) return String(pids[i][0]||'').trim();
  }
  return '';
}

/** d:staff by phone → { role, pid, staffId }. */
/** Canonicalize phone into several comparable tokens. */
function _canonPhoneTokens_(v) {
  let raw = String(v || '').trim().replace(/\s+/g,'');
  let noPrefix = raw.replace(/^whatsapp:/i,'').replace(/[^\d+]/g,'');
  if (!noPrefix) return { wa:'', e164:'', digits:'', last10:'' };
  if (noPrefix.startsWith('00')) noPrefix = '+' + noPrefix.slice(2);
  if (!noPrefix.startsWith('+') && noPrefix.length >= 10) noPrefix = '+' + noPrefix;
  const e164   = noPrefix;
  const wa     = 'whatsapp:' + e164;
  const digits = e164.replace(/[^\d]/g,'');
  const last10 = digits.slice(-10);
  return { wa, e164, digits, last10 };
}

/** d:staff by phone → { role, pid, staffId }. Fuzzy match (whatsapp:+E164, +E164, digits, last 10). */
function lookupStaffRecordByPhone_(ss, phoneInput) {
  const sh = ss.getSheetByName('d:staff');
  if (!sh) return { role:'Guest', pid:'', staffId:'', _debug:'no_sheet' };

  const H = _ciHeaderMap(sh);
  const cPhone = H['phone'] || H['whatsapp'] || H['whatsapp phone'] || 5; // E
  const cRole  = H['role']  || 7;                                         // G
  const cPid   = H['property id'] || 2;                                   // B
  const cSid   = H['staff id']     || 3;                                   // C

  const last = sh.getLastRow();
  if (!cPhone || last < 2) return { role:'Guest', pid:'', staffId:'', _debug:'no_rows' };

  const want = _canonPhoneTokens_(phoneInput);
  const n = last - 1;
  const phones = sh.getRange(2, cPhone, n, 1).getValues();
  const roles  = cRole ? sh.getRange(2, cRole, n, 1).getValues() : Array(n).fill(['']);
  const pids   = cPid  ? sh.getRange(2, cPid,  n, 1).getValues() : Array(n).fill(['']);
  const sids   = cSid  ? sh.getRange(2, cSid,  n, 1).getValues() : Array(n).fill(['']);

  for (let i = n - 1; i >= 0; i--) {
    const got = _canonPhoneTokens_(phones[i][0]);
    const hit = (got.wa === want.wa) || (got.e164 === want.e164) ||
                (got.digits === want.digits) || (got.last10 && got.last10 === want.last10);
    if (!hit) continue;
    return {
      role   : String(roles[i][0] || '').trim() || 'Guest',
      pid    : String(pids [i][0] || '').trim(),
      staffId: String(sids [i][0] || '').trim()
    };
  }
  return { role:'Guest', pid:'', staffId:'', _debug:'no_match' };
}



/** Lookup latest/active Booking Id by guest phone in 'd:bookingInfo'. */
function lookupBookingIdByPhone_(ss, phoneCandidate) {
  const want = (function __normPhoneE164(v) {
    v = String(v || '').trim().replace(/^whatsapp:/i, '');
    v = v.replace(/[^\d+]/g, '');
    if (v.startsWith('00')) v = '+' + v.slice(2);
    if (!v.startsWith('+') && v.length >= 10) v = '+' + v;
    return v;
  })(phoneCandidate);

  if (!want) return '';

  const sh = ss.getSheetByName('d:bookingInfo');
  if (!sh) return '';

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
  const norm = s => String(s || '')
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?:.,;—–-]/g, '');

  const H = {};
  hdr.forEach((h, i) => { const n = norm(h); if (n && !H[n]) H[n] = i + 1; });

  const pick = (...names) => { for (const n of names) { const c = H[norm(n)]; if (c) return c; } return null; };

  // Try common headers; adjust if your sheet differs.
  const C_BOOK = pick('booking id', 'reservation id', 'bookingid', 'reservationid', 'res id', 'id') || 2;
  const C_PHONE = pick('guest phone', 'phone', 'guest whatsapp', 'whatsapp', 'phone number', 'contact phone', 'guest phone number') || 16;
  const C_END   = pick('end date','check-out date','checkout date','check out date','departure date','check-out','checkout','check out','end');

  const last = sh.getLastRow();
  if (last < 2) return '';

  const n = last - 1;
  const bids   = sh.getRange(2, C_BOOK,  n, 1).getValues();
  const phones = sh.getRange(2, C_PHONE, n, 1).getValues();
  const ends   = C_END ? sh.getRange(2, C_END, n, 1).getValues() : Array(n).fill(['']);

  const normalizePhone = v => {
    v = String(v || '').trim().replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
    if (v.startsWith('00')) v = '+' + v.slice(2);
    if (!v.startsWith('+') && v.length >= 10) v = '+' + v;
    return v;
  };

  const asDate = v => {
    if (v instanceof Date) return v;
    const s = String(v || '').trim();
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : null;
  };

  const matches = [];
  for (let i = 0; i < n; i++) {
    const ph = normalizePhone(phones[i][0]);
    if (!ph || ph !== want) continue;
    const bid = String(bids[i][0] || '').trim();
    if (!bid) continue;
    matches.push({ bid, endDate: asDate(ends[i]?.[0] || '') , row: i + 2 });
  }
  if (!matches.length) return '';

  const now = Date.now();
  const withDate = matches.filter(m => m.endDate instanceof Date);
  const future   = withDate.filter(m => m.endDate.getTime() > now);
  if (future.length) {
    future.sort((a, b) => a.endDate - b.endDate);
    return future[0].bid;
  }
  if (withDate.length) {
    withDate.sort((a, b) => b.endDate - a.endDate);
    return withDate[0].bid;
  }
  return matches[matches.length - 1].bid;
}



/** ===========================
 *  Webhook: message_log push
 *  =========================== */
// --- replace sendMessageLogToWebhook() ---
function sendMessageLogToWebhook(messageData) {
  const props      = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('WEBHOOK_URL');
  const apiKey     = props.getProperty('WEBHOOK_API_KEY');
  const accountId  = parseInt(props.getProperty('ACCOUNT_ID') || '1', 10);

  if (!webhookUrl || !apiKey) {
    Logger.log('[sendMessageLogToWebhook] SKIP – missing WEBHOOK_URL or WEBHOOK_API_KEY');
    return null;
  }

  const payload = {
    data_type: 'message_log',
    account_id: accountId,
    message_uuid: messageData.sidSM || '',
    timestamp: new Date().toISOString(),
    from_number: messageData.from || '',
    to_number: messageData.to || '',
    message_body: messageData.body || '',
    message_type: messageData.typ || 'Outbound',
    reference_message_uuids: messageData.refMsg || '',
    reference_task_uuids: messageData.refTask || '',
    booking_id: messageData.bookingId || '',
    ai_enrichment_uuid: messageData.euid || '',
    requestor_role: messageData.requestorRole || '',
    raw_data: { original_data: messageData, timestamp: new Date().toISOString() }
  };

  try {
    Logger.log('[sendMessageLogToWebhook] ▶ payload=' + JSON.stringify(payload));
    const res = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-API-Key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const body = (res.getContentText() || '').slice(0, 500);
    Logger.log(`[sendMessageLogToWebhook] ◀ code=${code} body=${body}`);
    return code === 200 || code === 201;
  } catch (err) {
    Logger.log('[sendMessageLogToWebhook] ERROR: ' + err);
    return null;
  }
}





function archiveCompletedTasks() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const src   = ss.getSheetByName('aiTasks');
  const dest  = ss.getSheetByName('d:taskLog');
  if (!src || !dest) throw new Error('Sheet “aiTasks” or “d:taskLog” not found');

  const hdr      = getHeaderMap(src);
  const STAT_COL = hdr['Status'];
  if (!STAT_COL) throw new Error('Missing “Status” column in aiTasks');

  // Columns to keep intact (preserve formulas)
  const PRESERVE = [
    hdr['UUIDs'],
    hdr['On-going Conversation'] || hdr['Ongoing Conversation'],
    hdr['Response Recieved?'] || hdr['Response Received?']
  ].filter(Boolean);

  const lastRow  = src.getLastRow();
  if (lastRow < 2) return;

  const rowCount = lastRow - 1;
  const allVals  = src.getRange(2, 1, rowCount, src.getLastColumn()).getValues();
  const statuses = src.getRange(2, STAT_COL, rowCount, 1).getValues();

  // 1) Collect rows where Status == "Completed"
  const archiveVals = [];
  const sourceRows  = [];
  allVals.forEach((row, i) => {
    const s  = String(statuses[i][0] || '').trim().toLowerCase();
    const ok = (s === 'completed');
    if (ok) { archiveVals.push(row); sourceRows.push(i + 2); }
  });
  if (!archiveVals.length) return;

  // 2) Append to d:taskLog (same structure)
  dest.getRange(dest.getLastRow() + 1, 1, archiveVals.length, archiveVals[0].length)
      .setValues(archiveVals);

  // 3) Clear source rows except PRESERVE columns
  const lastCol = src.getLastColumn();
  sourceRows.forEach(r => {
    for (let c = 1; c <= lastCol; c++) {
      if (PRESERVE.includes(c)) continue;
      src.getRange(r, c).clearContent();
    }
  });

  Logger.log(`[archiveCompletedTasks] Moved ${archiveVals.length} row(s) to d:taskLog`);
}


/**
 * Uses your PROMPT_TASK_BOOLEAN_EVAL_* prompts to decide if all requirements are (or will be) met.
 * Returns the literal "TRUE" or "FALSE".
 */
function checkReqWithOpenAI(requirements, staffConversation, apiKey, model) {
  const systemMsg = PROMPT_TASK_BOOLEAN_EVAL_SYSTEM;
  const userMsg   = fillTpl_(PROMPT_TASK_BOOLEAN_EVAL_USER, {
    REQUIREMENTS: String(requirements||'').trim(),
    STAFF_MESSAGE: String(staffConversation||'').trim()
  });
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method:'post',
    contentType:'application/json',
    headers:{ Authorization:`Bearer ${apiKey}` },
    payload: JSON.stringify({
      model: model || OPENAI_MODEL,
      messages:[{role:'system',content:systemMsg},{role:'user',content:userMsg}]
    }),
    muteHttpExceptions:true
  });

  const txt = res.getContentText();
  Logger.log(`checkReqWithOpenAI ▶ REQUIREMENTS: ${requirements}`);
  Logger.log(`checkReqWithOpenAI ▶ STAFF CONV: ${staffConversation}`);
  Logger.log(`checkReqWithOpenAI ▶ API RESPONSE: ${txt}`);

  if (res.getResponseCode() !== 200) throw txt;

  const content = JSON.parse(txt).choices[0].message.content.trim();
  const upper   = content.toUpperCase();

  // Be tolerant to minor formatting (e.g., "TRUE.", "Answer: TRUE")
  if (/\bTRUE\b/.test(upper))  return 'TRUE';
  if (/\bFALSE\b/.test(upper)) return 'FALSE';

  // If model misbehaves, force a clear error so the caller can skip this row safely
  throw new Error(`Unexpected evaluator output: ${content}`);
}



/**
 * Evaluate each aiTasks row and write TRUE/FALSE into the "Status" column.
 * - Finds columns by header; creates "Status" at the end if missing.
 * - Requirements: "Requirements to Complete Task" (or "Requirements")
 * - Conversation: "On-going Conversation" (or "Ongoing Conversation")
 * - Optional gate: only evaluate rows where "Response Recieved?" or "Response Received?" is TRUE
 */
function evaluateTaskStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('aiTasks');
  if (!sh) throw new Error('Sheet "aiTasks" not found');

  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing.');

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
  const byNorm = {};
  hdr.forEach((h, i) => { const n = _normHeader_(h); if (n && !byNorm[n]) byNorm[n] = i + 1; });
  const pick = (...names) => { for (const n of names) { const c = byNorm[_normHeader_(n)]; if (c) return c; } return null; };

  const REQ_COL    = pick('Staff Requirements', 'Requirements to Complete Task', 'Requirements');
  const CONV_COL   = pick('On-going Conversation', 'Ongoing Conversation');
  const FLAG_COL   = pick('Response Recieved?', 'Response Received?');
  const HOLDER_COL = pick('Action Holder');

  // Ensure Status column exists
  let STAT_COL = byNorm[_normHeader_('Status')];
  if (!STAT_COL) {
    STAT_COL = sh.getLastColumn() + 1;
    sh.getRange(1, STAT_COL).setValue('Status');
  }

  if (!REQ_COL || !CONV_COL) {
    throw new Error('aiTasks is missing required columns: "Staff Requirements"/"Requirements to Complete Task"/"Requirements" and "On-going Conversation"/"Ongoing Conversation".');
  }

  const n = sh.getLastRow() - 1;
  if (n < 1) return;

  const reqVals   = sh.getRange(2, REQ_COL,  n, 1).getValues();
  const convVals  = sh.getRange(2, CONV_COL, n, 1).getValues();
  const gateVals  = FLAG_COL ? sh.getRange(2, FLAG_COL, n, 1).getValues() : Array(n).fill([true]);
  const statusOut = sh.getRange(2, STAT_COL, n, 1).getValues();
  const holderOut = HOLDER_COL ? sh.getRange(2, HOLDER_COL, n, 1).getValues() : Array(n).fill(['Staff']);

  let updated = 0;
  for (let i = 0; i < n; i++) {
    const gate = gateVals[i][0];
    const gateTrue = (typeof gate === 'boolean') ? gate : String(gate || '').trim().toUpperCase() === 'TRUE';
    if (!gateTrue) continue;

    const req  = String(reqVals[i][0]  || '').trim();
    const conv = String(convVals[i][0] || '').trim();
    if (!req || !conv) continue;

    try {
      const result = checkReqWithOpenAI(req, conv, apiKey); // 'TRUE' or 'FALSE'
      if (result === 'TRUE') {
        if (statusOut[i][0] !== 'Completed') { statusOut[i][0] = 'Completed'; updated++; }
      } else if (result === 'FALSE') {
        const holder = String(holderOut[i][0] || '').trim().toLowerCase();
        const newVal = (holder === 'guest') ? 'Waiting on Guest'
                     : (holder === 'host')  ? 'Waiting on Host'
                     : 'Waiting on Staff';
        if (statusOut[i][0] !== newVal) { statusOut[i][0] = newVal; updated++; }
      }
    } catch (e) {
      Logger.log(`evaluateTaskStatus ▶ Row ${i + 2}: OpenAI error – ${e}`);
    }
  }

  if (updated) sh.getRange(2, STAT_COL, n, 1).setValues(statusOut);
}



// === aiTasks_flow.gs — NEW helper: move escalated task to d:taskLog =========

/** Moves a single aiTasks row to 'd:taskLog' and marks "Host Escalated" = TRUE.
 *  - Copies by matching headers (name → name).
 *  - Creates "Host Escalated" header in d:taskLog if missing.
 *  - Clears the source row in aiTasks (preserves formula columns: UUIDs, On-going Conversation, Response Recieved?/Received?).
 */
function moveTaskRowToLogAsHostEscalated(aiTasksRow) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const src   = ss.getSheetByName('aiTasks');
  const dest  = ss.getSheetByName('d:taskLog');
  if (!src || !dest) throw new Error('Sheet “aiTasks” or “d:taskLog” not found');
  if (!aiTasksRow || aiTasksRow < 2) return;

  // Header maps
  const Hsrc  = getHeaderMap(src);
  let   Hdest = getHeaderMap(dest);

  // Ensure "Host Escalated" header exists in destination
  let destHostEscCol = Hdest['Host Escalated'];
  if (!destHostEscCol) {
    destHostEscCol = dest.getLastColumn() + 1;
    dest.getRange(1, destHostEscCol).setValue('Host Escalated');
    Hdest = getHeaderMap(dest); // refresh
  }

  // Build destination row sized to destination width
  const destLastCol = dest.getLastColumn();
  const outRow = Array(destLastCol).fill('');

  // Read the whole source row once
  const srcLastCol = src.getLastColumn();
  const srcValsRow = src.getRange(aiTasksRow, 1, 1, srcLastCol).getValues()[0];

  // Copy by matching header names
  Object.keys(Hsrc).forEach(name => {
    const cSrc  = Hsrc[name];
    const cDest = Hdest[name];
    if (cSrc && cDest && cDest <= destLastCol) {
      outRow[cDest - 1] = srcValsRow[cSrc - 1];
    }
  });

  // Mark "Host Escalated" = TRUE
  outRow[destHostEscCol - 1] = true;

  // Append to d:taskLog
  dest.getRange(dest.getLastRow() + 1, 1, 1, destLastCol).setValues([outRow]);

  // Clear source row (preserve common formula columns)
  const PRESERVE = [
    Hsrc['UUIDs'],
    Hsrc['On-going Conversation'] || Hsrc['Ongoing Conversation'],
    Hsrc['Response Recieved?'] || Hsrc['Response Received?']
  ].filter(Boolean);

  for (let c = 1; c <= srcLastCol; c++) {
    if (PRESERVE.indexOf(c) !== -1) continue;
    src.getRange(aiTasksRow, c).clearContent();
  }
}



/** =========================================================================
 *  Orchestrator
 *  ========================================================================= */
function refreshNowTrigger() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Info');
  if (sh) sh.getRange('C2').setValue(new Date());
}

function runPlugins() {
  LIBRambleaiTasks.Plugins_runAll();   // not .Plugins.runAll()
}

function getTaskJSONFromTasks_(propertyId, subCategoryName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('tasks');
  if (!sh) return '';
  const last = sh.getLastRow();
  if (last < 2) return '';

  const n = last - 1;
  const jsonCol = sh.getRange(2, 1, n, 1).getValues(); // A
  const pidCol  = sh.getRange(2, 2, n, 1).getValues(); // B
  const subCol  = sh.getRange(2, 5, n, 1).getValues(); // E

  const wantPid = String(propertyId || '').trim();
  const wantSub = _canonLabel_(subCategoryName || '');

  for (let i = n - 1; i >= 0; i--) {
    const pid = String(pidCol[i][0] || '').trim();
    const sub = _canonLabel_(subCol[i][0] || '');
    if (pid === wantPid && sub === wantSub) {
      return String(jsonCol[i][0] || '').trim();
    }
  }
  return '';
}


// === orchestrator.gs — UPDATED: runFullAutomation() hook ===================
// Add ONE call inside runFullAutomation(), anywhere BEFORE sendWhatsApp().

// ===== robust lock (no errors, just skips) =====
function withGlobalRunLock_(runnerFn) {
  const SOFT_TTL_SEC = 58;                  // soft throttle to match 1-min trigger
  const cacheKey     = 'runFullAutomation_softlock';
  const cache        = CacheService.getScriptCache();
  const token        = Utilities.getUuid();

  // Hard lock: if another run holds it, skip gracefully
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1)) {
    Logger.log('[runFullAutomation] another run is active (script lock) — skipping.');
    return false;
  }

  let softSet = false;
  try {
    // Soft throttle: if a recent run was within TTL, skip (no exception)
    if (cache && cache.get(cacheKey)) {
      Logger.log('[runFullAutomation] recent run detected (soft lock) — skipping.');
      return false;
    }
    if (cache) { cache.put(cacheKey, token, SOFT_TTL_SEC); softSet = true; }

    runnerFn();
    return true;

  } finally {
    try { if (softSet && cache && cache.get(cacheKey) === token) cache.remove(cacheKey); } catch (_) {}
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Optional heartbeat for quick diagnostics
function _setRunHeartbeat_(stage) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      'runFullAutomation_heartbeat',
      JSON.stringify({ stage: String(stage||'').trim(), ts: Date.now() })
    );
  } catch (_) {}
}

// ===== orchestrator (replace your current runFullAutomation) =====
function runFullAutomation() {
  withGlobalRunLock_(() => {
    _setRunHeartbeat_('start');
    try { refreshNowTrigger(); } catch (_){}

    try { processSummarizeMessage(); } catch (e) { Logger.log('processSummarizeMessage: ' + e); }
    try { buildAiResponseFromSummaries(); } catch (e) { Logger.log('buildAiResponseFromSummaries: ' + e); }
    SpreadsheetApp.flush(); Utilities.sleep(400);

    _setRunHeartbeat_('guest-replies');
    try { createReplyAndLog(); } catch (_){}
    try { createStaffTasks();  } catch (_){}
    try { clearAiResponseSheet_(); } catch (e) { Logger.log('clearAiResponseSheet_: ' + e); }

    try { LIBRambleaiTasks.Plugins.runAll(); } catch (e) { Logger.log('Plugins.runAll: ' + e); }

    _setRunHeartbeat_('triage');
    try { evaluateTaskStatus();   } catch (e) { Logger.log('evaluateTaskStatus: ' + e); }
    try { buildNextTaskMessage(); } catch (_){}
    try { processHostEscalationsFromAiTasks(); } catch (e) { Logger.log('processHostEscalationsFromAiTasks: ' + e); }

    // ✅ Consolidate batchList → execution (grouped by To + Recipient Type)
    _setRunHeartbeat_('consolidate-batchList');
    try { consolidateAiLogPendingToExecution(); } catch (e) { Logger.log('consolidateAiLogPendingToExecution: ' + e); }

    SpreadsheetApp.flush(); Utilities.sleep(1500);

    _setRunHeartbeat_('send');
    try { sendWhatsApp();          } catch (e) { Logger.log('sendWhatsApp: ' + e); }

    // ✅ Clear execution after sending/logging
    try { clearExecutionTab_(); } catch (e) { Logger.log('clearExecutionTab_: ' + e); }

    try { archiveCompletedTasks(); } catch (e) { Logger.log('archiveCompletedTasks: ' + e); }

    _setRunHeartbeat_('done');
  });
}