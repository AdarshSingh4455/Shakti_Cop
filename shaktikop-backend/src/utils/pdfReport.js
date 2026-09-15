const PDFDocument = require('pdfkit');
const fontkit = require('fontkit');
const path = require('path');

// ============================================================
// 🆕 Automated PDF Report Generation
//
// पहले "Generate करें" सिर्फ़ रिपोर्ट का डेटा JSON के रूप में लौटाता था —
// कोई असली PDF फ़ाइल कभी नहीं बनती थी, कोई ईमेल कभी नहीं जाती थी।
//
// 🐛 बग फ़िक्स (गंभीर — टेक्स्ट-रेंडरिंग): पहला संस्करण pdfkit के सामान्य
// doc.text() API से हिंदी लिखता था — जिससे असली PDF तो बनती, पर हिंदी टेक्स्ट
// गलत दिखता (जैसे "पुलिस" की जगह "पुिलस", "रिपोर्ट" की जगह "िरपोटर्")। इसका
// कारण: देवनागरी जैसी जटिल लिपियों में मात्राएं/रेफ़ को सही जगह दिखाने के लिए
// OpenType "शेपिंग" ज़रूरी है — pdfkit का doc.text() यह नहीं करता (हर अक्षर को
// टाइप किए क्रम में सीधा बाएं-से-दाएं रख देता है)। असली परीक्षण (pdftotext से
// निकालकर पढ़ने पर) से यह पुष्टि हुई थी।
//
// फ़िक्स: pdfkit जिस fontkit लाइब्रेरी को अंदर से इस्तेमाल करता है, उसी का
// font.layout() तरीक़ा सही शेपिंग करता है (visually सत्यापित — रेंडर करके,
// PDF को इमेज में बदलकर आंखों से जांचा गया)। इसलिए यहां doc.text() की जगह हर
// पंक्ति को खुद shape करके, हर अक्षर (glyph) की सही स्थिति पर सीधे उसकी
// आकृति (path) खींची जाती है।
// ============================================================

const HINDI_FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'NotoSansDevanagari-Regular.ttf');
const PAGE_WIDTH = 595.28; // A4, pt
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// एक बार लोड करके पूरे PDF-generation में दोबारा इस्तेमाल — हर पंक्ति के लिए
// दोबारा फ़ॉन्ट-फ़ाइल पढ़ना अनावश्यक व धीमा होता
let cachedFont = null;
function getShapingFont() {
  if (!cachedFont) cachedFont = fontkit.openSync(HINDI_FONT_PATH);
  return cachedFont;
}

// किसी टेक्स्ट को given fontSize पर shape करके उसकी कुल चौड़ाई (pt में) बताता है —
// पंक्ति-विभाजन (word-wrap) के लिए ज़रूरी
function measureWidth(font, text, fontSize) {
  const run = font.layout(text);
  return (run.advanceWidth / font.unitsPerEm) * fontSize;
}

// लंबे टेक्स्ट को maxWidth के अंदर कई पंक्तियों में तोड़ता है (शब्दों के बीच से) —
// pdfkit के built-in word-wrap के बराबर, पर हमारे अपने shaped-glyph रेंडरर के लिए
function wrapText(font, text, fontSize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (measureWidth(font, attempt, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// असली रेंडरिंग — एक पंक्ति के हर shaped glyph को उसकी सही स्थिति पर खींचता है।
// लौटाता है: उस पंक्ति की कुल चौड़ाई (pt में) — केंद्र-में-रखने (center-align) के काम आता है।
function drawShapedLine(doc, font, text, x, y, fontSize, color) {
  const scale = fontSize / font.unitsPerEm;
  const run = font.layout(text);
  doc.save();
  doc.fillColor(color);
  let cx = x;
  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i];
    const pos = run.positions[i];
    if (glyph.path && glyph.path.commands.length > 0) {
      doc.save();
      doc.translate(cx + pos.xOffset * scale, y - pos.yOffset * scale);
      doc.scale(scale, -scale);
      doc.path(glyph.path.toSVG()).fill(color);
      doc.restore();
    }
    cx += pos.xAdvance * scale;
  }
  doc.restore();
  return cx - x;
}

// केंद्र में रखी हुई एक पंक्ति
function drawCenteredLine(doc, font, text, y, fontSize, color) {
  const width = measureWidth(font, text, fontSize);
  const x = MARGIN + (CONTENT_WIDTH - width) / 2;
  drawShapedLine(doc, font, text, x, y, fontSize, color);
}

// लंबा टेक्स्ट हो तो अपने-आप कई पंक्तियों में लिखता है, और अगली खाली जगह (y) लौटाता है
function drawWrappedText(doc, font, text, x, y, fontSize, color, maxWidth, lineHeight) {
  const lines = wrapText(font, text, fontSize, maxWidth);
  let cy = y;
  for (const line of lines) {
    drawShapedLine(doc, font, line, x, cy, fontSize, color);
    cy += lineHeight;
  }
  return cy;
}

// रिपोर्ट-डेटा से एक PDF Buffer बनाता है (फ़ाइल के रूप में सेव नहीं करता — सीधे
// मेमोरी में, ताकि न तो डिस्क पर संवेदनशील रिपोर्ट डेटा बचा रहे, न ही सफ़ाई की चिंता)
function buildReportPdfBuffer({ title, district, generatedAt, reportData }) {
  return new Promise((resolve, reject) => {
    try {
      const font = getShapingFont();
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = MARGIN;

      // ---------- हेडर ----------
      drawCenteredLine(doc, font, 'ShaktiCop — उत्तर प्रदेश पुलिस', y, 20, '#8E2A46');
      y += 28;
      drawCenteredLine(doc, font, title, y, 15, '#0F2A44');
      y += 22;
      const metaLine = `${district ? `ज़िला: ${district}` : 'राज्य-स्तरीय रिपोर्ट'}  ·  बनाई गई: ${new Date(generatedAt).toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata' })}`;
      drawCenteredLine(doc, font, metaLine, y, 10, '#5B5750');
      y += 22;
      doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor('#D9D3C7').stroke();
      y += 22;

      // ---------- मुख्य आंकड़े ----------
      drawShapedLine(doc, font, 'मुख्य आंकड़े', MARGIN, y, 13, '#0F2A44');
      y += 22;
      const stats = [
        ['कुल शिकायतें', reportData.total],
        ['दर्ज (लंबित)', reportData.pending],
        ['अधिकारी नियुक्त', reportData.assigned],
        ['कार्यवाही जारी', reportData.inProgress],
        ['निस्तारित', reportData.resolved],
        ['अस्वीकृत', reportData.rejected],
        ['औसत निस्तारण-समय (घंटे)', reportData.avgResolutionHours || 'लागू नहीं'],
      ];
      for (const [label, value] of stats) {
        const labelText = `${label}:`;
        drawShapedLine(doc, font, labelText, MARGIN, y, 11, '#000000');
        const labelWidth = measureWidth(font, labelText, 11);
        drawShapedLine(doc, font, String(value), MARGIN + labelWidth + 8, y, 11, '#8E2A46');
        y += 18;
      }

      // ---------- श्रेणी-वार ----------
      if (reportData.byCategory && reportData.byCategory.length > 0) {
        y += 14;
        drawShapedLine(doc, font, 'शीर्ष श्रेणियां', MARGIN, y, 13, '#0F2A44');
        y += 22;
        for (const c of reportData.byCategory) {
          const labelText = `${c.category}:`;
          drawShapedLine(doc, font, labelText, MARGIN, y, 11, '#000000');
          const labelWidth = measureWidth(font, labelText, 11);
          drawShapedLine(doc, font, String(c.total), MARGIN + labelWidth + 8, y, 11, '#2E7D5B');
          y += 18;
        }
      }

      // ---------- फ़ुटर ----------
      y += 30;
      y = drawWrappedText(
        doc,
        font,
        'यह स्वचालित रूप से जनरेट हुई रिपोर्ट है — ShaktiCop सिस्टम द्वारा। किसी भी प्रश्न के लिए संबंधित थाना/ज़िला कार्यालय से संपर्क करें।',
        MARGIN,
        y,
        8,
        '#5B5750',
        CONTENT_WIDTH,
        12
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildReportPdfBuffer };
