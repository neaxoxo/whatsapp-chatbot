require("dotenv").config();

const {
    makeWASocket,
    useMultiFileAuthState,
    downloadContentFromMessage,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("baileys");

const pino = require("pino");
const { createSticker, StickerTypes } = require("wa-sticker-formatter");
const readline = require("readline");
const ffmpegPath = require("ffmpeg-static");
const fluentFfmpeg = require("fluent-ffmpeg");
const Groq = require("groq-sdk");
const fs = require("fs");

fluentFfmpeg.setFfmpegPath(ffmpegPath);

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const SYSTEM_PROMPT =
    "Your name is Nea. You are a soft-spoken and supportive assistant." +
    "If the user greets you or asks who you are, introduce yourself as Nea and mention that they can type .menu for help. " +
    "Be friendly and supportive, especially when users talk about their problems. Avoid being too formal and keep responses natural, like a real human.";

const HISTORY_FILE = "./histories.json";

let chatHistories = {};

if (fs.existsSync(HISTORY_FILE)) {
    try {
        chatHistories = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    } catch {
        chatHistories = {};
    }
}

const saveHistory = () => {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(chatHistories, null, 2));
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
};

async function connectToWhatsapp() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState("pairing_session");

    const socket = makeWASocket({
        version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!socket.authState.creds.registered) {
        console.log("PAIRING CODE MODE");

        const phoneNumber = await question("Enter your WhatsApp number: ");

        setTimeout(async () => {
            try {
                let code = await socket.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`Pairing Code: ${code}`);
            } catch (err) {
                console.error("Pairing request failed:", err);
            }
        }, 3000);
    }

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) connectToWhatsapp();
        }

        if (connection === "open") {
            console.log("Bot connected with Groq AI.");
        }
    });

    socket.ev.on("messages.upsert", async ({ messages }) => {
        const chat = messages[0];
        if (!chat.message || chat.key.fromMe) return;

        const jid = chat.key.remoteJid;

        const messageText =
            chat.message?.conversation ||
            chat.message?.extendedTextMessage?.text ||
            chat.message?.imageMessage?.caption ||
            chat.message?.videoMessage?.caption ||
            "";

        const isImage = chat.message?.imageMessage;
        const isVideo = chat.message?.videoMessage;

        if (messageText.toLowerCase() === ".menu") {
            const menu =
                "*NEA CHATBOT MENU* 🌸\n\n" +
                "1. *.sticker* — Reply to an image/video with this caption\n" +
                "2. *.reset* — Clear chat memory\n" +
                "3. *Chat* — Talk with the AI normally\n\n" +
                "_Ready to help._";

            await socket.sendMessage(jid, { text: menu }, { quoted: chat });
            return;
        }

        if (messageText.toLowerCase() === ".reset") {
            chatHistories[jid] = [];
            saveHistory();
            await socket.sendMessage(jid, { text: "Memory cleared. Let's start fresh." });
            return;
        }

        if (messageText.toLowerCase() === ".sticker" && (isImage || isVideo)) {
            try {
                const getMedia = async (msg) => {
                    const type = Object.keys(msg.message)[0];
                    const stream = await downloadContentFromMessage(
                        msg.message[type],
                        type.replace("Message", "")
                    );

                    let buffer = Buffer.from([]);

                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    return buffer;
                };

                const media = await getMedia(chat);

                const sticker = await createSticker(media, {
                    pack: "Nea Bot",
                    author: "@neaxoxo",
                    type: StickerTypes.FULL,
                    quality: 30
                });

                await socket.sendMessage(jid, { sticker }, { quoted: chat });
            } catch (err) {
                console.error("Sticker creation failed:", err);
            }

            return;
        }

        if (messageText && !isImage && !isVideo) {
            try {
                if (!chatHistories[jid]) chatHistories[jid] = [];

                await socket.sendPresenceUpdate("composing", jid);
                await delay(1500);

                chatHistories[jid].push({
                    role: "user",
                    content: messageText
                });

                if (chatHistories[jid].length > 10) chatHistories[jid].shift();

                saveHistory();

                const completion = await groq.chat.completions.create({
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        ...chatHistories[jid]
                    ],
                    model: "llama-3.3-70b-versatile"
                });

                const aiResponse =
                    completion.choices[0]?.message?.content ||
                    "Sorry, I couldn't understand that.";

                chatHistories[jid].push({
                    role: "assistant",
                    content: aiResponse
                });

                saveHistory();

                await socket.sendPresenceUpdate("paused", jid);

                await socket.sendMessage(jid, { text: aiResponse }, { quoted: chat });
            } catch (err) {
                console.error("Groq error:", err);

                await socket.sendPresenceUpdate("paused", jid);

                await socket.sendMessage(jid, {
                    text: "Sorry, something went wrong."
                });
            }
        }
    });
}

connectToWhatsapp();
