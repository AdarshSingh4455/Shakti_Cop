const crypto = require('crypto');

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0,O,1,I हटाए ताकि पढ़ने में confusion न हो

function randomPart(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return out;
}

// शिकायत ID अब पूरी तरह random बनती है — किसी भी condition/case (मोबाइल नंबर, समय आदि)
// पर निर्भर नहीं। उदाहरण: SK-4K7QX2-93H1
function newComplaintId() {
  return `SK-${randomPart(6)}-${randomPart(4)}`;
}

// 🆕 सेवा-अनुरोध (काउंसलिंग/कानूनी सहायता आदि) की ID — यहां भी वही random तरीक़ा।
// पहले यह मोबाइल के कुछ अंक + समय से बनती थी, यानी अनुमान-योग्य थी (ठीक वही
// पैटर्न जो शिकायत-ID से हटाया जा चुका है)। prefix पहले जैसा ही रहता है ताकि
// अनुरोध का प्रकार ID देखकर ही पता चलता रहे।
function newRequestId(prefix) {
  return `${prefix || 'SR'}-${randomPart(6)}-${randomPart(4)}`;
}

module.exports = { newComplaintId, newRequestId };
