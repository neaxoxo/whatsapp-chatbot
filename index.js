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
    const { state, saveCreds } = await useMultiFileAuthState("nea_pairing_session");

    const socket = makeWASocket({
        version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!socket.authState.creds.registered) {
        console.log("--- PAIRING CODE MODE ---");

        const phoneNumber = await question(
            "Enter your WhatsApp number (example: 628123456789): "
        );

        setTimeout(async () => {
            try {
                let code = await socket.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;

                console.log(`\nYOUR PAIRING CODE: ${code}`);
                console.log(
                    "Open WhatsApp > Linked Devices > Link a Device > Link with phone number.\n"
                );
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
            console.log(`Disconnected. Code: ${reason}`);

            if (reason !== DisconnectReason.loggedOut) {
                console.log("Reconnecting...");
                connectToWhatsapp();
            } else {
                console.log("Session logged out. Delete 'nea_pairing_session' and restart.");
            }
        }

        if (connection === "open") {
            console.log("Bot is now active.");
        }
    });

    socket.ev.on("messages.upsert", async ({ messages }) => {
        const chat = messages[0];
        if (!chat.message) return;

        const messageText = (
            chat.message?.extendedTextMessage?.text ??
            chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
            chat.message?.conversation
        )?.toLowerCase() || "";

        if (messageText === ".ping") {
            await socket.sendMessage(
                chat.key.remoteJid,
                { text: "*PONG!* 🏓" },
                { quoted: chat }
            );
        }

        const isImage = chat.message?.imageMessage;
        const isVideo = chat.message?.videoMessage;
        const caption = isImage?.caption || isVideo?.caption || "";

        if (caption === ".sticker" && (isImage || isVideo)) {
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
                    quality: 50
                });

                await socket.sendMessage(
                    chat.key.remoteJid,
                    { sticker },
                    { quoted: chat }
                );

                console.log("Sticker sent.");
            } catch (err) {
                console.error("Sticker creation failed:", err);
            }
        }
    });
}

connectToWhatsapp();
