// ============================================================
// AWS Secrets Manager — production में .env फ़ाइल की जगह
//
// ⚠️ यह पूरी तरह वैकल्पिक (optional) है — अगर SECRETS_MANAGER_SECRET_NAME
// सेट नहीं है, तो कुछ नहीं होता, app हमेशा की तरह .env / प्लेटफ़ॉर्म की अपनी
// environment-variables से चलता रहता है (Railway, स्थानीय विकास, आदि)।
//
// इस्तेमाल: AWS पर production में सिर्फ़ एक environment variable सेट करें —
//   SECRETS_MANAGER_SECRET_NAME=shaktikop/production
// बाक़ी सभी keys (JWT_SECRET, FIELD_ENCRYPTION_KEY, DATABASE_URL, आदि) वहां
// एक JSON secret के रूप में Secrets Manager में रहती हैं — कोड में कहीं भी
// कोई बदलाव नहीं करना पड़ता, बाक़ी पूरा codebase अब भी process.env.KEY_NAME
// से ही पढ़ता है, बस अब वह मान .env की जगह Secrets Manager से आया होता है।
// ============================================================

async function loadSecretsFromAwsIfConfigured() {
  const secretName = process.env.SECRETS_MANAGER_SECRET_NAME;
  if (!secretName) return; // सामान्य .env व्यवहार — ज़्यादातर deployments (Railway आदि) के लिए यही सही है

  let SecretsManagerClient, GetSecretValueCommand;
  try {
    ({ SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager'));
  } catch (e) {
    console.error('⚠️ SECRETS_MANAGER_SECRET_NAME सेट है, पर @aws-sdk/client-secrets-manager इंस्टॉल नहीं है — npm install चलाएं।');
    return;
  }

  try {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-south-1' });
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
    const secrets = JSON.parse(result.SecretString);

    let count = 0;
    for (const [key, value] of Object.entries(secrets)) {
      // 🔒 पहले से (जैसे Elastic Beanstalk की अपनी environment properties से) सेट
      // कोई value हो, तो उसे कभी ओवरराइट नहीं करते — Secrets Manager सिर्फ़ जो
      // गायब हो उसे भरता है, यह ज़्यादा सुरक्षित/अनुमानित (predictable) व्यवहार है।
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = String(value);
        count++;
      }
    }
    console.log(`🔒 Secrets Manager से ${count} keys लोड हुईं (secret: ${secretName})`);
  } catch (e) {
    // ⚠️ जान-बूझकर यहां क्रैश नहीं करते — अगर secret न मिले तो app आगे बढ़ेगा,
    // और सामान्य startup की "सुरक्षा-जाँच" (server.js में) बताएगी कि कौन-सी
    // ज़रूरी key असल में गायब है। इससे डिबग करना आसान रहता है।
    console.error('⚠️ AWS Secrets Manager से keys लोड नहीं हो सकीं:', e.message);
  }
}

module.exports = { loadSecretsFromAwsIfConfigured };
