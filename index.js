require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const { TwitterApi } = require("twitter-api-v2");

// ✅ Çevresel değişkenler
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INFURA_API_URL = process.env.INFURA_API_URL;
const ICO_ADDRESS = process.env.ICO_ADDRESS
  ? process.env.ICO_ADDRESS.toLowerCase()
  : null;
const VIDEO_URL = "https://drive.google.com/uc?export=download&id=1UXdSRcGiiqEfQfCYHqNv5_gaH4oCEZ0G";
const ICO_SALE_LINK = "https://crnttoken.net/";

// ✅ Twitter API Ayarları
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !INFURA_API_URL || !ICO_ADDRESS) {
  console.error("❌ Gerekli çevresel değişkenler eksik. .env dosyanızı kontrol edin.");
  process.exit(1);
}

// ✅ BSC Sağlayıcı
const provider = new ethers.JsonRpcProvider(INFURA_API_URL);

// ✅ JSON Dosyası ile Verileri Sakla
const dataFile = "ico_data.json";
let totalHolders = 391;
let totalRaised = 371371.5900000001;

// **JSON dosyası varsa verileri yükle**
if (fs.existsSync(dataFile)) {
  try {
    const savedData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    totalHolders = savedData.totalHolders || 391;
    totalRaised = savedData.totalRaised || 371371.5900000001;
  } catch (error) {
    console.error("⚠️ JSON verisi okunurken hata oluştu, varsayılan değerler kullanılacak.");
  }
}

console.log("📡 Blockchain işlemleri dinleniyor...");

// ✅ **ICO Smart Contract Dinleyici**
async function listenICO() {
  const abi = ["event TokensPurchased(address indexed buyer, uint256 amount)"];

  try {
    const icoContract = new ethers.Contract(ICO_ADDRESS, abi, provider);
    console.log("📡 'TokensPurchased' işlemleri dinleniyor...");

    icoContract.on("TokensPurchased", async (buyer, amount, event) => {
      const amountInTokens = ethers.formatEther(amount);
      const txHash = event.transactionHash || "N/A"; // İşlem hash kontrolü

      // **Token fiyatını al**
      const pricePerToken = await getTokenPrice();

      // **USDT bazında toplam fiyat hesapla**
      const totalUsd = parseFloat((amountInTokens * pricePerToken).toFixed(2));

      // **Total Raised artır**
      totalRaised += totalUsd;

      // **Her alımı yeni yatırımcı olarak say**
      totalHolders += 1;

      // **Verileri JSON dosyasına kaydet**
      fs.writeFileSync(
        dataFile,
        JSON.stringify(
          {
            totalHolders,
            totalRaised,
          },
          null,
          2
        )
      );

      // **Gönderilecek Mesaj**
      const message = `
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡
🔥 *NEW PRESALE BUY!* 🔥
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡

💰 *Amount:* ${totalUsd.toFixed(2)} USDT
💵 *Total:* $${totalUsd.toFixed(2)}
📊 *Price Per Token:* $${pricePerToken}
📈 *Total Raised:* $${totalRaised.toFixed(2)}
👥 *Total Holders:* ${totalHolders} 
🔗 [View on BscScan](https://bscscan.com/tx/${txHash})

💎 *[Buy Creationnetwork ($CRNT)](${ICO_SALE_LINK})*
      `;

      console.log("✅ Yeni işlem tespit edildi:", message);

      await sendVideoToTelegram(message);
      await sendVideoToTwitter(message);
    });
  } catch (error) {
    console.error("❌ ICO işlemlerini dinlerken hata oluştu:", error.message);
    process.exit(1);
  }
}

// ✅ **Token fiyatını al**
async function getTokenPrice() {
  try {
    const abi = ["function sellTokenInUDSTPrice(uint256) external view returns (uint256)"];
    const contract = new ethers.Contract(ICO_ADDRESS, abi, provider);
    const price = await contract.sellTokenInUDSTPrice(ethers.parseEther("1"));
    return parseFloat(ethers.formatEther(price)).toFixed(2);
  } catch (error) {
    console.error("⚠️ Token fiyatı alınırken hata oluştu:", error.message);
    return "N/A";
  }
}

// ✅ **Telegram'a video ile mesaj gönder**
async function sendVideoToTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`;

  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      video: VIDEO_URL,
      caption: message,
      parse_mode: "Markdown",
    });

    console.log("✅ Telegram'a video ile mesaj gönderildi!");
  } catch (err) {
    console.error("❌ Telegram mesajı gönderilemedi:", err.message);
  }
}

// ✅ **Twitter'a video ile mesaj gönder**
async function sendVideoToTwitter(message) {
  try {
    console.log("📤 Twitter'a video yükleniyor...");

    // ✅ 1. Videoyu yükle
    const mediaId = await twitterClient.v1.uploadMedia(VIDEO_URL, { type: "video/mp4" });

    console.log("✅ Video yüklendi! Media ID:", mediaId);

    // ✅ 2. Tweeti gönder
    await twitterClient.v2.tweet({
      text: message,
      media: { media_ids: [mediaId] },
    });

    console.log("✅ Twitter'a video ile mesaj gönderildi!");
  } catch (err) {
    console.error("❌ Twitter mesajı gönderilemedi:", err.message);
  }
}

// ✅ **Botu başlat**
listenICO();
