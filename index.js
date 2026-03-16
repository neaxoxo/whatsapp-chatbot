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

fluentFfmpeg.setFfmpegPath(ffmpegPath);

const groq = new Groq({
    apiKey: "Fill it with your API Key (you can get it on console.groq.com)"
});

const SYSTEM_PROMPT =
    "Your name is Nea. You are a soft-spoken and supportive assistant. Respond in Indonesian unless the user speaks English. Keep it friendly and helpful for students.";

const welcomedUsers = new Set();
const chatHistories = {};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
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
        console.log("--- PAIRING CODE MODE ---");

        const phoneNumber = await question("Enter your WhatsApp number: ");

        setTimeout(async () => {
            try {
                let code = await socket.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\nPAIRING CODE: ${code}`);
            } catch (err) {
                console.error("Failed to request pairing code:", err);
            }
        }, 3000);
    }

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update) => {
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
                "*NEA BOT MENU* 🌸\n\n" +
                "1. *.sticker* (Reply to an image/video with this caption)\n" +
                "2. *.reset* (Clear chat memory)\n" +
                "3. *Normal Chat* (Talk to the AI normally)\n\n" +
                "_I remember conversations now._";

            await socket.sendMessage(jid, { text: menu }, { quoted: chat });
            return;
        }

        if (messageText.toLowerCase() === ".reset") {
            chatHistories[jid] = [];
            await socket.sendMessage(jid, {
                text: "Memory cleared. Let's start fresh."
            });
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
                    author: "@nea666xo",
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

                let welcomePrefix = "";

                if (!welcomedUsers.has(jid)) {
                    welcomePrefix =
                        "Hello! I'm Nea. 😊\nType *.menu* to see my features.\n\n---\n\n";
                    welcomedUsers.add(jid);
                }

                chatHistories[jid].push({
                    role: "user",
                    content: messageText
                });

                if (chatHistories[jid].length > 10) chatHistories[jid].shift();

                const messagesForGroq = [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...chatHistories[jid]
                ];

                const completion = await groq.chat.completions.create({
                    messages: messagesForGroq,
                    model: "llama-3.3-70b-versatile"
                });

                const aiResponse =
                    completion.choices[0]?.message?.content ||
                    "Sorry, something went wrong.";

                chatHistories[jid].push({
                    role: "assistant",
                    content: aiResponse
                });

                await socket.sendPresenceUpdate("paused", jid);

                await socket.sendMessage(
                    jid,
                    { text: welcomePrefix + aiResponse },
                    { quoted: chat }
                );
            } catch (err) {
                console.error("Groq error:", err);

                await socket.sendPresenceUpdate("paused", jid);

                await socket.sendMessage(jid, {
                    text: "Sorry, something went wrong. Please try again."
                });
            }
        }
    });
}

connectToWhatsapp();
