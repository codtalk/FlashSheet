// Apps Script: Code.gs
// Deploy as Web App (Execute as: Me, Who has access: Anyone with link)
// This endpoint expects form-urlencoded body with key `rows` whose value is a JSON array.
// Each row can be either feedback items or vocabulary items. For vocab items, this script
// will append a new row or update an existing row by `word` (case-insensitive).
// Supported SRS fields (optional): addedAt, reps, lapses, ease, interval, due, lastReview

function doPost(e){
  try{
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var DEFAULT_MAIN = 'Sheet1';
  var FEEDBACK_SHEET = 'Feedback';
  // Use DEFAULT_MAIN (defined above) rather than an undefined MAIN_SHEET variable
  var main = ss.getSheetByName(DEFAULT_MAIN) || ss.getSheets()[0];
    var fb = ss.getSheetByName(FEEDBACK_SHEET) || ss.insertSheet(FEEDBACK_SHEET);

  var rowsParam = e && e.parameter && e.parameter.rows ? e.parameter.rows : null;
  if (!rowsParam) return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Missing rows' })).setMimeType(ContentService.MimeType.JSON);
  var rows = JSON.parse(rowsParam);
  if (!Array.isArray(rows)) return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'rows must be array' })).setMimeType(ContentService.MimeType.JSON);

    var now = new Date();
    var mainValues = [];
    var fbValues = [];

  // Determine target sheet name: allow per-user sheet/tab via e.parameter.user
  var userName = (e && e.parameter && e.parameter.user) ? String(e.parameter.user).trim() : '';
  var sheetName = userName || DEFAULT_MAIN;
  var main = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  // Read existing header and data
  var dataRange = main.getDataRange();
    var data = dataRange.getValues();
    if (!data) data = [];
    var header = (data.length > 0) ? data[0].map(function(h){ return (h||'').toString(); }) : [];

    // Collect all keys present in incoming rows (vocab rows), so we can ensure header contains them
    var incomingKeys = {};
    rows.forEach(function(r){
      if (r && typeof r === 'object' && !(r.type && String(r.type).toLowerCase() === 'feedback')){
        for (var k in r){ if (!k) continue; incomingKeys[k] = true; }
      }
    });

    // Ensure required base header fields
    var required = ['timestamp','word','definition'];
    // Merge existing header, keeping order, and then append any missing incoming keys (except timestamp/definition aliases)
    var finalHeader = header.length ? header.slice() : required.slice();
    // Add incoming keys if not already present
    Object.keys(incomingKeys).forEach(function(k){
      var lk = k.toString();
      if (lk === 'definition' || lk === 'definitions') return; // handled as definition
      if (lk === 'timestamp') return;
      if (finalHeader.indexOf(lk) === -1) finalHeader.push(lk);
    });
    // Ensure 'definition' column exists
    if (finalHeader.indexOf('definition') === -1) finalHeader.splice(1,0,'definition');

    // If header changed, write it
    var headerChanged = (header.length !== finalHeader.length) || finalHeader.some(function(h,i){ return header[i] !== h; });
    if (headerChanged){
      // Replace header row
      if (data.length === 0){
        main.appendRow(finalHeader);
        data = main.getDataRange().getValues();
      } else {
        main.getRange(1,1,1,finalHeader.length).setValues([finalHeader]);
        data = main.getDataRange().getValues();
      }
      header = finalHeader;
    }

    // Build lookup map word -> rowIndex (1-based rows, data array includes header at index 0)
    var wordToRow = {};
    for (var i = 1; i < data.length; i++){
      var r = data[i] || [];
      var w = (r[1] || '').toString().trim().toLowerCase();
      if (w) wordToRow[w] = i + 1; // sheet row number (1-indexed)
    }

    // Process incoming rows
    rows.forEach(function(r){
      var word = (r.word !== undefined ? r.word : (Array.isArray(r) ? r[1] : '') ) || '';
      word = (word || '').toString().trim();
      var defs = r.definition !== undefined ? r.definition : (r.definitions !== undefined ? r.definitions : '');
      if (Array.isArray(defs)) defs = defs.join('; ');
      defs = (defs || '').toString();

      var isFeedback = (r.type && String(r.type).toLowerCase() === 'feedback') || word === '[feedback]';
      if (isFeedback){
        var msg = r.message !== undefined ? r.message : defs;
        var ctx = r.ctx || '';
        var user = r.user || '';
        fbValues.push([now, user, msg, ctx]);
        return;
      }

      // Build a row array matching the final header order
      var rowArr = [];
      for (var hi = 0; hi < header.length; hi++){
        var col = header[hi];
        if (col === 'timestamp') rowArr.push(now);
        else if (col === 'word') rowArr.push(word);
        else if (col === 'definition') rowArr.push(defs);
        else {
          // Other columns: take value from incoming object or ''
          var v = r[col] !== undefined ? r[col] : '';
          // If definitions provided as array, skip (already handled)
          if (Array.isArray(v)) v = v.join('; ');
          rowArr.push(v);
        }
      }

      if (!word){
        // No word: append row as-is
        mainValues.push(rowArr);
        return;
      }

      var key = word.toLowerCase();
      if (wordToRow[key]){
        // Update existing row in-place
        try{
          var rowNum = wordToRow[key];
          main.getRange(rowNum, 1, 1, rowArr.length).setValues([rowArr]);
        }catch(e){
          // fallback to append
          mainValues.push(rowArr);
        }
      } else {
        // New row to append
        mainValues.push(rowArr);
      }
    });

    // Write batched values
    if (mainValues.length){
      var startRow = main.getLastRow() + 1;
      // Use the header length so we write the correct number of columns
      var writeCols = finalHeader && finalHeader.length ? finalHeader.length : mainValues[0].length;
      main.getRange(startRow, 1, mainValues.length, writeCols).setValues(mainValues);
    }
    if (fbValues.length){
      var fbStart = fb.getLastRow() + 1;
      fb.getRange(fbStart, 1, fbValues.length, 4).setValues(fbValues);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok:true, appendedMain: mainValues.length, appendedFeedback: fbValues.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err){
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Support GET to read a user's sheet (return JSON); if the user's sheet/tab does not exist, create it with header and return empty array
function doGet(e){
  try{
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var userName = (e && e.parameter && e.parameter.user) ? String(e.parameter.user).trim() : '';
    var op = (e && e.parameter && e.parameter.op) ? String(e.parameter.op).trim().toLowerCase() : '';
    var sheetName = userName || 'Sheet1';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet){
      sheet = ss.insertSheet(sheetName);
      // create an empty header
      sheet.appendRow(['timestamp','word','definition']);
    }
    if (op === 'read'){
      var data = sheet.getDataRange().getValues();
      if (!data || data.length <= 1) {
        var emptyPayload = JSON.stringify([]);
        var cb = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : null;
        if (cb) return ContentService.createTextOutput(cb + '(' + emptyPayload + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
        return ContentService.createTextOutput(emptyPayload).setMimeType(ContentService.MimeType.JSON);
      }
      var header = data[0];
      var out = [];
      for (var i = 1; i < data.length; i++){
        var row = data[i];
        var obj = {};
        for (var j = 0; j < header.length; j++){
          var key = (header[j] || '').toString();
          var val = row[j];
          if (key === 'definition' || key === 'definitions'){
            var s = (val || '').toString();
            obj['definitions'] = s ? s.split(/;\s*/).filter(Boolean) : [];
          } else if (key){
            obj[key] = val;
          }
        }
        // ensure word exists
        if (obj.word) out.push(obj);
      }
      var payload = JSON.stringify(out);
      var callback = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : null;
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + payload + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
    }
    var payloadErr = JSON.stringify({ ok:false, error:'Unsupported GET operation' });
    var cbErr = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : null;
    if (cbErr) return ContentService.createTextOutput(cbErr + '(' + payloadErr + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(payloadErr).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    var errPayload = JSON.stringify({ ok:false, error:String(err) });
    var cb = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : null;
    if (cb) return ContentService.createTextOutput(cb + '(' + errPayload + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(errPayload).setMimeType(ContentService.MimeType.JSON);
  }
}
