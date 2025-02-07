require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const { TwitterApi } = require("twitter-api-v2");

// ✅ Çevresel değişkenler
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const RPC_URL = process.env.RPC_URL || "https://rpc.ankr.com/bsc";  // Yeni RPC URL
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
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

// ✅ Gerekli env değişkenlerini kontrol et
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !RPC_URL || !ICO_ADDRESS) {
  console.error("❌ Gerekli çevresel değişkenler eksik. .env dosyanızı kontrol edin.");
  process.exit(1);
}

// ✅ BSC Sağlayıcı (JSON-RPC)
const provider = new ethers.JsonRpcProvider(RPC_URL);

// ✅ JSON Dosyası ile Verileri Sakla
const dataFile = "ico_data.json";
let totalHolders = 391;
let totalRaised = 371371.59;

// **JSON dosyası varsa verileri yükle**
if (fs.existsSync(dataFile)) {
  try {
    const savedData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    totalHolders = savedData.totalHolders || 391;
    totalRaised = savedData.totalRaised || 371371.59;
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
    console.log("📡 'TokensPurchased' işlemleri BSC RPC ile dinleniyor...");

    icoContract.on("TokensPurchased", async (buyer, amount, event) => {
      console.log("✅ Event Log:", event);

      // **Düzgün bir işlem hash olup olmadığını kontrol et**
      const txHash = event.transactionHash ? event.transactionHash : event.log?.transactionHash;
      const bscscan_link = txHash ? `https://bscscan.com/tx/${txHash}` : "https://bscscan.com";

      if (!txHash) {
        console.error("⚠️ İşlem hash bulunamadı, işlem geçersiz olabilir.");
        return;
      }

      // **Token fiyatını al**
      const pricePerToken = await getTokenPrice();

      // **USDT bazında toplam fiyat hesapla**
      const totalUsd = parseFloat((ethers.formatEther(amount) * pricePerToken).toFixed(2));

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
🚀 *NEW ICO PURCHASE!*  
💰 *Amount:* ${totalUsd.toFixed(2)} USDT  
💵 *Total Raised:* $${totalRaised.toFixed(2)}  
📈 *Price Per Token:* $${pricePerToken}  
👥 *Total Holders:* ${totalHolders}  
🔗 [View on BscScan](${bscscan_link})  
💎 *[Buy CRNT Now](${ICO_SALE_LINK})*
      `;

      console.log("✅ Yeni işlem tespit edildi:", message);

      // Telegram'a video ve mesaj gönder
      await sendVideoToTelegram(message);

      // Twitter'a mesaj gönder
      await sendTweet(message);
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

// ✅ **Twitter'a mesaj gönder**
async function sendTweet(message) {
  try {
    await twitterClient.v2.tweet(message);
    console.log("✅ Twitter mesajı başarıyla gönderildi!");
  } catch (error) {
    console.error("❌ Twitter mesajı gönderilemedi:", error.message);
  }
}

// ✅ **Botu başlat**
listenICO();
