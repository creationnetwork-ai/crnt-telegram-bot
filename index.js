require("dotenv").config();
const { ethers } = require("ethers");
const axios = require("axios");

// ✅ Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const INFURA_API_URL = process.env.INFURA_API_URL;
const ICO_ADDRESS = process.env.ICO_ADDRESS
  ? process.env.ICO_ADDRESS.toLowerCase()
  : null;

if (
  !TELEGRAM_BOT_TOKEN ||
  !TELEGRAM_CHAT_ID ||
  !INFURA_API_URL ||
  !ICO_ADDRESS
) {
  console.error(
    "❌ Missing required environment variables. Check your .env file."
  );
  process.exit(1);
}

// ✅ Binance Smart Chain Provider
const provider = new ethers.JsonRpcProvider(INFURA_API_URL);

// ✅ Başlangıç Değerleri
let totalHolders = 368; // Başlangıç olarak 368 yatırımcı
let totalRaised = 368995; // Başlangıç olarak 368,995 USDT
const previousBuyers = new Set(); // Yatırımcıları takip et

console.log("📡 Listening for ICO transactions...");

// ✅ ICO Smart Contract Event Listener
async function listenICO() {
  const abi = ["event TokensPurchased(address indexed buyer, uint256 amount)"];

  try {
    const icoContract = new ethers.Contract(ICO_ADDRESS, abi, provider);
    console.log("📡 Listening for 'TokensPurchased' events...");

    icoContract.on("TokensPurchased", async (buyer, amount, event) => {
      const amountInTokens = ethers.formatEther(amount);

      // 🔹 Transaction Hash doğrulama
      let txHash = "N/A";
      if (event && event.transactionHash) {
        txHash = event.transactionHash;
      } else if (event.log && event.log.transactionHash) {
        txHash = event.log.transactionHash;
      }

      // 🔹 Token fiyatını al
      const pricePerToken = await getTokenPrice();

      // 🔹 USDT bazında ödenen toplam tutarı hesapla
      const totalUsd = (amountInTokens * pricePerToken).toFixed(2);

      // 🔹 Total Raised'ı doğru artır
      totalRaised = parseFloat(totalRaised) + parseFloat(totalUsd);

      // 🔹 Yatırımcıyı kontrol et, yeni yatırımcıysa holders sayısını artır
      if (!previousBuyers.has(buyer)) {
        previousBuyers.add(buyer);
        totalHolders += 1;
      }

      const message = `
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡
🔥 *NEW PRESALE BUY!* 🔥
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡

💰 *Amount:* ${totalUsd} USDT
💵 *Total:* $${totalUsd}
📊 *Price Per Token:* $${pricePerToken}
📈 *Total Raised:* $${totalRaised.toFixed(2)}
👥 *Total Holders:* ${totalHolders}
🔗 [View on BscScan](https://bscscan.com/tx/${txHash})
      `;

      console.log("✅ New transaction detected:", message);

      sendToTelegram(message);
    });
  } catch (error) {
    console.error("❌ Error listening to ICO purchases:", error.message);
    process.exit(1);
  }
}

// ✅ Get Token Price from Current Stage
async function getTokenPrice() {
  try {
    const abi = [
      "function sellTokenInUDSTPrice(uint256) external view returns (uint256)",
    ];
    const contract = new ethers.Contract(ICO_ADDRESS, abi, provider);
    const price = await contract.sellTokenInUDSTPrice(ethers.parseEther("1"));
    return ethers.formatEther(price);
  } catch (error) {
    console.error("⚠️ Error fetching token price:", error.message);
    return "N/A";
  }
}

// ✅ Send Message to Telegram Bot
async function sendToTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });

    console.log("✅ Notification sent to Telegram!");
  } catch (err) {
    console.error("❌ Failed to send Telegram message:", err.message);
  }
}

// ✅ Start the Bot
listenICO();
