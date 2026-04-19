const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHAT_FILE = path.join(__dirname, 'chat-storage.json');
const PORT = 3000;

function initStorage() {
    if (!fs.existsSync(CHAT_FILE)) {
        const initial = { general: [], stream: [] };
        fs.writeFileSync(CHAT_FILE, JSON.stringify(initial, null, 2), 'utf8');
    }
}

function readStorage() {
    try {
        return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    } catch (err) {
        console.error('Chyba čtení chat-storage.json:', err);
        return { general: [], stream: [] };
    }
}

function writeStorage(data) {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const clients = new Set();

function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function sendResponse(res, status, data) {
    const json = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(json);
}

function handleChat(req, res, chatType) {
    if (req.method === 'OPTIONS') {
        sendResponse(res, 200, { ok: true });
        return;
    }

    const storage = readStorage();
    if (req.method === 'GET') {
        sendResponse(res, 200, storage[chatType] || []);
        return;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const message = JSON.parse(body);
                if (!message.text || !message.author || !message.time) {
                    sendResponse(res, 400, { error: 'Chybějící data' });
                    return;
                }
                const messages = storage[chatType] || [];
                messages.push({ author: message.author, text: message.text, time: message.time });
                storage[chatType] = messages;
                writeStorage(storage);
                // Broadcast the new message
                broadcast({ type: chatType, message: { author: message.author, text: message.text, time: message.time } });
                sendResponse(res, 200, messages);
            } catch (err) {
                console.error('Chyba parsování zprávy:', err);
                sendResponse(res, 400, { error: 'Neplatná zpráva' });
            }
        });
        return;
    }

    sendResponse(res, 405, { error: 'Metoda není podporována' });
}

initStorage();

const server = http.createServer((req, res) => {
    const url = req.url;
    if (url === '/chat/general') {
        return handleChat(req, res, 'general');
    }
    if (url === '/chat/stream') {
        return handleChat(req, res, 'stream');
    }
    if (url === '/chat/general/delete' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.time) {
                    sendResponse(res, 400, { error: 'Chybějící čas' });
                    return;
                }
                const storage = readStorage();
                const messages = storage.general || [];
                const index = messages.findIndex(msg => msg.time === data.time);
                if (index === -1) {
                    sendResponse(res, 404, { error: 'Zpráva nenalezena' });
                    return;
                }
                messages.splice(index, 1);
                storage.general = messages;
                writeStorage(storage);
                sendResponse(res, 200, { ok: true });
            } catch (err) {
                console.error('Chyba mazání zprávy:', err);
                sendResponse(res, 400, { error: 'Neplatná data' });
            }
        });
        return;
    }
    if (url === '/chat/stream/delete' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.time) {
                    sendResponse(res, 400, { error: 'Chybějící čas' });
                    return;
                }
                const storage = readStorage();
                const messages = storage.stream || [];
                const index = messages.findIndex(msg => msg.time === data.time);
                if (index === -1) {
                    sendResponse(res, 404, { error: 'Zpráva nenalezena' });
                    return;
                }
                messages.splice(index, 1);
                storage.stream = messages;
                writeStorage(storage);
                sendResponse(res, 200, { ok: true });
            } catch (err) {
                console.error('Chyba mazání zprávy:', err);
                sendResponse(res, 400, { error: 'Neplatná data' });
            }
        });
        return;
    }
    if (url === '/' || url === '/status') {
        sendResponse(res, 200, { ok: true, server: 'Lonestar chat backend', port: PORT });
        return;
    }
    sendResponse(res, 404, { error: 'Nenalezeno' });
});

server.listen(PORT, () => {
    console.log(`Lonestar chat backend listening on http://127.0.0.1:${PORT}`);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New WebSocket connection');

    ws.on('close', () => {
        clients.delete(ws);
        console.log('WebSocket connection closed');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});
