require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");

// ✅ Çevresel değişkenler
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INFURA_API_URL = process.env.INFURA_API_URL;
const ICO_ADDRESS = process.env.ICO_ADDRESS
  ? process.env.ICO_ADDRESS.toLowerCase()
  : null;

// ✅ Satış Sayfası Linki
const ICO_SALE_PAGE = "https://crnttoken.net/";
// ✅ Video Linki (Google Drive veya başka bir sunucudan sağlanmalı)
const VIDEO_URL =
  "https://drive.google.com/uc?export=download&id=1UXdSRcGiiqEfQfCYHqNv5_gaH4oCEZ0G";

if (
  !TELEGRAM_BOT_TOKEN ||
  !TELEGRAM_CHAT_ID ||
  !INFURA_API_URL ||
  !ICO_ADDRESS
) {
  console.error(
    "❌ Gerekli çevresel değişkenler eksik. .env dosyanızı kontrol edin."
  );
  process.exit(1);
}

// ✅ BSC Sağlayıcı
const provider = new ethers.JsonRpcProvider(INFURA_API_URL);

// ✅ JSON Dosyası ile Verileri Sakla
const dataFile = "ico_data.json";
let totalHolders = 368; // Başlangıç olarak 368 yatırımcı
let totalRaised = 368995; // Başlangıç olarak 368,995 USDT
let previousBuyers = new Set();

// **JSON dosyası varsa verileri yükle**
if (fs.existsSync(dataFile)) {
  try {
    const savedData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    totalHolders = savedData.totalHolders || 368;
    totalRaised = savedData.totalRaised || 368995;
    previousBuyers = new Set(savedData.previousBuyers || []);
  } catch (error) {
    console.error(
      "⚠️ JSON verisi okunurken hata oluştu, varsayılan değerler kullanılacak."
    );
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
      totalRaised = parseFloat(totalRaised) + totalUsd;

      // **Yeni kullanıcı mı kontrol et**
      if (!previousBuyers.has(buyer)) {
        previousBuyers.add(buyer);
        totalHolders += 1;
      }

      // **Verileri JSON dosyasına kaydet**
      fs.writeFileSync(
        dataFile,
        JSON.stringify(
          {
            totalHolders,
            totalRaised,
            previousBuyers: Array.from(previousBuyers),
          },
          null,
          2
        )
      );

      // **Telegram Mesaj Formatı**
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
      `;

      console.log("✅ Yeni işlem tespit edildi:", message);

      sendToTelegram(message);
    });
  } catch (error) {
    console.error("❌ ICO işlemlerini dinlerken hata oluştu:", error.message);
    process.exit(1);
  }
}

// ✅ **Token fiyatını al**
async function getTokenPrice() {
  try {
    const abi = [
      "function sellTokenInUDSTPrice(uint256) external view returns (uint256)",
    ];
    const contract = new ethers.Contract(ICO_ADDRESS, abi, provider);
    const price = await contract.sellTokenInUDSTPrice(ethers.parseEther("1"));
    return parseFloat(ethers.formatEther(price)).toFixed(2);
  } catch (error) {
    console.error("⚠️ Token fiyatı alınırken hata oluştu:", error.message);
    return "N/A";
  }
}

// ✅ **Telegram'a mesaj ve video gönder**
async function sendToTelegram(message) {
  const sendMessageUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const sendVideoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`;

  try {
    // 📹 **Önce videoyu gönder**
    await axios.post(sendVideoUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      video: VIDEO_URL,
      caption: message,
      parse_mode: "Markdown",
    });

    console.log("✅ Video ve mesaj Telegram'a gönderildi!");

    // 📌 **Son olarak butonu olan mesajı gönder**
    await axios.post(sendMessageUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: "🚀 Buy Creationnetwork ($CRNT)",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔹 Buy CRNT Token 🔹", url: ICO_SALE_PAGE }],
        ],
      },
      parse_mode: "Markdown",
    });

    console.log("✅ Satış butonu gönderildi!");
  } catch (err) {
    console.error("❌ Telegram mesajı/video gönderilemedi:", err.message);
  }
}

// ✅ **Botu başlat**
listenICO();
