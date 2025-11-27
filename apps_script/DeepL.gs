// DeepL proxy for Cardcard — publish as Web App (Anyone)
// Protect your key by storing in Script Properties
// Properties > Script properties: set DEEPL_API_KEY and optionally DEEPL_API_BASE

function doPost(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};
    var text = (params.text || '').toString();
    var sl = (params.sl || '').toString();
    var tl = (params.tl || '').toString();
    if (!text) return json({ error: 'missing text' }, 400);

    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('DEEPL_API_KEY');
    var base = props.getProperty('DEEPL_API_BASE');
    if (!key) return json({ error: 'missing key' }, 500);

    var endpoint = (base && base.replace(/\/?$/, '')) || (/:fx$/i.test(key) ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
    endpoint += '/v2/translate';

    var payload = {
      text: text,
      target_lang: normalizeLang(tl, 'target') || 'EN'
    };
    var src = normalizeLang(sl, 'source');
    if (src) payload.source_lang = src;
    payload.preserve_formatting = '1';
    payload.split_sentences = '1';

    var options = {
      method: 'post',
      payload: payload,
      headers: { 'Authorization': 'DeepL-Auth-Key ' + key },
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(endpoint, options);
    var status = resp.getResponseCode();
    var body = resp.getContentText();
    if (status < 200 || status >= 300) return json({ error: 'deepl', status: status, body: body }, 500);
    var data;
    try { data = JSON.parse(body); } catch (err) { data = null; }
    var out = '';
    if (data && data.translations && data.translations.length && data.translations[0].text) {
      out = data.translations[0].text;
    }
    return json({ text: out }, 200);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}

function normalizeLang(code, kind){
  var raw = (code || '').toString().trim();
  if (!raw) return kind === 'target' ? 'EN' : '';
  var up = raw.toUpperCase();
  var map = {
    'EN-US':'EN-US','EN-GB':'EN-GB','EN':'EN','EN_US':'EN-US','EN_GB':'EN-GB',
    'VI':'VI','VI-VN':'VI','VI_VN':'VI',
    'ZH':'ZH','ZH-CN':'ZH','ZH_TW':'ZH',
    'PT-BR':'PT-BR','PT-PT':'PT-PT','PT':'PT-PT'
  };
  if (map[up]) return map[up];
  var two = up.split('-')[0];
  return two || (kind === 'target' ? 'EN' : '');
}

function json(obj, status){
  var out = ContentService.createTextOutput(JSON.stringify(obj || {}));
  out.setMimeType(ContentService.MimeType.JSON);
  out.setHeader('Access-Control-Allow-Origin', '*');
  out.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  out.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Apps Script doesn't support setting status directly on TextOutput; use HtmlOutput hack for status
  var html = HtmlService.createHtmlOutput(JSON.stringify(obj || {}));
  html.setTitle('JSON');
  // Return TextOutput (CORS headers) — status not strictly controllable, but fine for browser use.
  return out;
}
