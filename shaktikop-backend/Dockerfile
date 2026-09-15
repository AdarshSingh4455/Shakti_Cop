FROM node:20-alpine

WORKDIR /app

# 🔒 npm ci (npm install की जगह) — package-lock.json से बिल्कुल वही dependencies
# install करता है, कभी उसे बदलता नहीं (reproducible build) — production/CI के लिए
# npm की खुद की सिफ़ारिश है
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# 🔒 बग फ़िक्स (हार्डनिंग): पहले कोई USER निर्देश नहीं था — कंटेनर हमेशा root के
# रूप में चलता था। अगर कभी किसी dependency की कमज़ोरी से कोड-execution हो भी जाए,
# हमलावर को सीधे root मिल जाता — container-escape/फ़ाइल-सिस्टम छेड़छाड़ का जोखिम बढ़ जाता।
# node:alpine image में एक बिना-विशेषाधिकार वाला "node" उपयोगकर्ता पहले से मौजूद है।
RUN chown -R node:node /app
USER node

EXPOSE 4000

# हार्डनिंग: होस्टिंग प्लेटफ़ॉर्म से अलग एक अपना healthcheck भी — कंटेनर-स्तर पर
# ज़िंदा/मरा हुआ पता चल सके
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
