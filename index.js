const { makeWASocket, useMultiFileAuthState, downloadContentFromMessage, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { createSticker, StickerTypes } = require('wa-sticker-formatter');
const qrcode = require('qrcode-terminal');

/**
 * Function to connect to WhatsApp using BAILEYS.
 */
async function connectToWhatsapp() {
    // Retrieve authentication data from session storage
    const auth = await useMultiFileAuthState("session");

    // Create WhatsApp socket with specific configuration
    const socket = makeWASocket({
        printQRInTerminal: false, // Set to false because we will print it manually below
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        auth: auth.state,
        logger: pino({ level: 'silent' }),
    });

    // Event listener to update credentials
    socket.ev.on("creds.update", auth.saveCreds);

    // Event listener to update connection status
    socket.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Print QR Code manually if available
        if (qr) {
            console.log('--- PLEASE SCAN THE QR CODE BELOW ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'connecting') {
            console.log('Attempting to connect...');
        } else if (connection === 'open') {
            console.log("Connection Open! Bot is now active. ✅");
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`Connection closed. Reason: ${reason}`);

            // Smart reconnect logic to prevent looping if logged out
            if (reason !== DisconnectReason.loggedOut) {
                console.log('Attempting to reconnect...');
                connectToWhatsapp();
            } else {
                console.log('Connection lost due to Logout. Delete the session folder and scan again.');
            }
        }
    });

    // Event listener for incoming messages
    socket.ev.on("messages.upsert", async ({ messages }) => {
        const chat = messages[0];
        if (!chat.message) return;

        // Retrieve message text
        const messageText = (
            chat.message?.extendedTextMessage?.text ??
            chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
            chat.message?.conversation
        )?.toLowerCase() || "";

        // Respond to .ping command
        if (messageText === '.ping') {
            let responseMsg = `*PONG!* 🏓\nBot is currently active and responsive.`;
            await socket.sendMessage(chat.key.remoteJid, { text: responseMsg }, { quoted: chat });
        }

        else if (messageText === '.help') {
            let responseMsg = `*Available Commands* :\n\n1. *.help*: Display help menu.\n2. *.ping*: Check bot status.\n3. *.sticker* [send image/video]: Convert media into a sticker.\n\nEnjoy!`;
            await socket.sendMessage(chat.key.remoteJid, { text: responseMsg }, { quoted: chat });
        }

        // Create sticker if the message is an image/video with the caption '.sticker'
        const isImage = chat.message?.imageMessage;
        const isVideo = chat.message?.videoMessage;
        const caption = isImage?.caption || isVideo?.caption || "";

        if (caption === '.sticker' && (isImage || isVideo)) {
            try {
                console.log('Processing sticker...');

                const getMedia = async (msg) => {
                    const msgType = Object.keys(msg?.message)[0];
                    const stream = await downloadContentFromMessage(msg.message[msgType], msgType.replace("Message", ''));
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    return buffer;
                };

                const mediaData = await getMedia(chat);

                const stickerOption = {
                    pack: 'Nea',
                    author: '@neaxoxo',
                    type: StickerTypes.FULL,
                    quality: 50 // Slightly lower quality for faster processing and safe file size
                };

                const generateSticker = await createSticker(mediaData, stickerOption);
                await socket.sendMessage(chat.key.remoteJid, { sticker: generateSticker }, { quoted: chat });
                console.log('Sticker sent successfully!');

            } catch (error) {
                console.error('Error while creating sticker:', error);
                await socket.sendMessage(chat.key.remoteJid, { text: `Oops, failed to create sticker: ${error.message}` }, { quoted: chat });
            }
        }
    });
}

// Run the bot
connectToWhatsapp();
