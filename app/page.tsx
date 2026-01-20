const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/client');
const { Server } = require("socket.io");
const http = require('http');
const cors = require('cors');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

// 🔥 新引擎引入 (取代 whatsapp-web.js)
const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode'); // 用來產生圖片給前端

require('dotenv').config();

const app = express();
const prisma = new PrismaClient();

// ✅ 讓 Railway 決定 Port
const port = process.env.PORT || 8000;

// -----------------------------------------
// 🟢 中介軟體設定 (CORS & JSON)
// -----------------------------------------
// 解決手機連線失敗的關鍵：允許跨域請求
app.use(cors({
    origin: '*', // 允許所有來源 (包含你的手機)
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 開放 uploads 資料夾 (以防需要讀取本地檔案)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

const upload = multer({ storage: multer.memoryStorage() });

// AWS S3 設定
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// -----------------------------------------
// 🟢 WhatsApp 初始化 (Baileys SaaS 核心)
// -----------------------------------------
console.log("🔄 正在啟動 WhatsApp 客戶端 (SaaS Engine)...");

let sock;
let qrCodeDataUrl = null;
let isWhatsappReady = false;

async function connectToWhatsApp() {
    // 設定 Session 儲存 (讓連線持久化)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // 在 Log 印出文字版 QR
        logger: pino({ level: 'silent' }), // 隱藏雜訊
        browser: ["Event SaaS", "Chrome", "1.0.0"],
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // A. 產生 QR Code
        if (qr) {
            console.log('🚨 新的 QR Code 產生中...');
            qrCodeDataUrl = await QRCode.toDataURL(qr);
            io.emit('wa_qr', qrCodeDataUrl);
            isWhatsappReady = false;
        }

        // B. 連線成功
        if (connection === 'open') {
            console.log('✅ WhatsApp 已連線！(Ready)');
            qrCodeDataUrl = null;
            isWhatsappReady = true;
            io.emit('wa_ready', true);
        }

        // C. 斷線重連
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ 連線中斷，嘗試重連:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// 啟動連線
connectToWhatsApp();

// -----------------------------------------
// 🌐 路由: 現場掃描頁面 (秒開版)
// -----------------------------------------
app.get('/connect', (req, res) => {
    if (isWhatsappReady) {
        return res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ WhatsApp 已連線成功！</h1>');
    }
    if (!qrCodeDataUrl) {
        return res.send('<h1 style="text-align:center; margin-top:50px;">🔄 系統初始化中...<br>(請稍候 3 秒)</h1><script>setTimeout(()=>location.reload(), 3000)</script>');
    }
    res.send(`
        <div style="text-align:center; padding-top:50px; font-family:sans-serif;">
            <h1>請使用 WhatsApp 掃描</h1>
            <img src="${qrCodeDataUrl}" style="border:5px solid #333; width:300px;" />
            <p>QR Code 自動刷新中...</p>
        </div>
        <script>setTimeout(() => location.reload(), 5000);</script>
    `);
});

// -----------------------------------------
// 📐 輔助函式 (AI & Vector)
// -----------------------------------------
function l2Normalize(vector) {
    const sum = vector.reduce((acc, val) => acc + (val * val), 0);
    const magnitude = Math.sqrt(sum);
    return vector.map(val => val / magnitude);
}

async function getFaceEmbeddings(imageBuffer) {
  try {
    const jpgBuffer = await sharp(imageBuffer).rotate().toFormat('jpeg').toBuffer();
    const form = new FormData();
    form.append('file', jpgBuffer, { filename: 'image.jpg' });

    const aiUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001/analyze';
    if (aiUrl.includes('127.0.0.1') && process.env.RAILWAY_ENVIRONMENT) {
        console.warn("⚠️ 警告: AI_SERVICE_URL 指向 localhost，雲端環境可能會失敗");
    }

    const response = await axios.post(aiUrl, form, { headers: { ...form.getHeaders() } });
    return response.data.faces.map(face => ({
        ...face,
        embedding: l2Normalize(face.embedding)
    }));
  } catch (error) {
    console.error("❌ AI 分析失敗:", error.message);
    return [];
  }
}

// -----------------------------------------
// 📝 路由: 賓客登記
// -----------------------------------------
app.post('/register', upload.array('photos', 5), async (req, res) => {
    if (!req.files || req.files.length === 0 || !req.body.name || !req.body.phone) {
        return res.status(400).send('缺少資料');
    }
    try {
        const { name, phone } = req.body;
        console.log(`📝 新登記: ${name}`);

        const person = await prisma.person.upsert({
            where: { phoneNumber: phone },
            update: { name },
            create: { name, phoneNumber: phone }
        });

        let savedCount = 0;
        for (const file of req.files) {
            try {
                const faces = await getFaceEmbeddings(file.buffer);
                if (faces.length !== 1) continue;
                
                const filename = `reg-${person.id}-${Date.now()}-${savedCount}.jpg`;
                await s3.send(new PutObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME, Key: filename, Body: file.buffer, ContentType: file.mimetype,
                }));
                const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;

                const photo = await prisma.photo.create({
                    data: { url: imageUrl, fileName: filename, status: 'Reference' }
                });

                const vectorString = JSON.stringify(faces[0].embedding);
                const bboxString = JSON.stringify(faces[0].bbox);
                
                // ✅ 修正：強制指定 vector(512) 並移除註解以免 SQL 錯誤
                await prisma.$executeRaw`
                    INSERT INTO "Face" ("photoId", "personId", "confidence", "boundingBox", "embedding")
                    VALUES (${photo.id}, ${person.id}, 100, ${bboxString}::jsonb, ${vectorString}::vector(512));
                `;
                savedCount++;
            } catch (err) { console.error(err); }
        }

        if (savedCount === 0) return res.status(400).json({ error: "照片不合格" });
        
        // 🔥 Baileys 發送訊息
        if (isWhatsappReady) {
            const jid = `${phone.replace('+', '')}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: `Hi ${name}！登記成功！已記錄 ${savedCount} 個角度。` });
        }

        res.json({ success: true, count: savedCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------
// 📸 路由: 攝影師上傳
// -----------------------------------------
app.post('/upload', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file');
  try {
    const timestamp = Date.now();
    const originalFilename = `original-${timestamp}-${req.file.originalname}`;
    const framedFilename = `framed-${timestamp}-${req.file.originalname}`;
    
    // 合成處理
    const framePath = path.join(__dirname, 'uploads', 'frame.png');
    let finalBuffer = req.file.buffer;
    if (fs.existsSync(framePath)) {
      const frameMetadata = await sharp(framePath).metadata();
      finalBuffer = await sharp(req.file.buffer)
        .rotate().resize({ width: frameMetadata.width, height: frameMetadata.height, fit: 'cover' })
        .composite([{ input: framePath, gravity: 'center' }]).toBuffer();
    }

    // 上傳 S3
    await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: originalFilename, Body: req.file.buffer, ContentType: req.file.mimetype }));
    await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: framedFilename, Body: finalBuffer, ContentType: req.file.mimetype }));

    const originalUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${originalFilename}`;
    const framedUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${framedFilename}`;

    const newPhoto = await prisma.photo.create({
      data: { url: framedUrl, originalUrl: originalUrl, fileName: framedFilename, status: 'COMPLETED' },
    });

    // AI 辨識
    const faces = await getFaceEmbeddings(req.file.buffer);
    for (const face of faces) {
        const vectorString = JSON.stringify(face.embedding);
        const bboxString = JSON.stringify(face.bbox);

        // ✅ 修正：搜尋時使用 vector(512)
        const [match] = await prisma.$queryRaw`
          SELECT p.id, p.name, p."phoneNumber", (f.embedding <-> ${vectorString}::vector(512)) as distance
          FROM "Face" f
          JOIN "Person" p ON f."personId" = p.id
          WHERE f.embedding <-> ${vectorString}::vector(512) < 0.6
          ORDER BY distance ASC LIMIT 1;
        `;

        // ✅ 修正：存檔時也必須使用 vector(512)
        await prisma.$executeRaw`
           INSERT INTO "Face" ("photoId", "personId", "confidence", "boundingBox", "embedding")
           VALUES (${newPhoto.id}, ${match ? match.id : null}, 100, ${bboxString}::jsonb, ${vectorString}::vector(512));
        `;

        // 🔥 Baileys 發送照片通知
        if (match && match.phoneNumber && isWhatsappReady) {
           const jid = `${match.phoneNumber.replace('+', '')}@s.whatsapp.net`;
           await sock.sendMessage(jid, { 
               text: `📸 嘿 ${match.name}！找到一張你的新照片：\n${framedUrl}`
           });
        }
    }

    io.emit('new_photo_ready', newPhoto);
    res.json(newPhoto);

  } catch (error) {
    console.error(error);
    res.status(500).send('Upload failed');
  }
});

// -----------------------------------------
// 其他路由 (刪除、搜尋、查詢)
// -----------------------------------------
app.delete('/photo/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const photo = await prisma.photo.findUnique({ where: { id: parseInt(id) } });
        if (!photo) return res.status(404).send('Photo not found');
        if (photo.fileName) {
            try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: photo.fileName })); } catch (e) {}
        }
        await prisma.photo.delete({ where: { id: parseInt(id) } });
        io.emit('photo_deleted', parseInt(id));
        res.json({ success: true });
    } catch (error) { res.status(500).send("Delete failed"); }
});

// 🔥 [DEBUG版] 搜尋路由 (完整修正版)
app.post('/guest-search', upload.single('selfie'), async (req, res) => {
  console.log("🔍 [DEBUG] 收到搜尋請求，開始處理...");

  // 1. 檢查有沒有上傳照片
  if (!req.file) {
    console.log("❌ [DEBUG] 錯誤：沒收到照片檔案");
    return res.status(400).send('請拍攝照片');
  }

  try {
    // 2. 呼叫 AI 取得特徵值
    console.log("🔥 [DEBUG] 正在呼叫 AI 計算特徵值...");
    const faces = await getFaceEmbeddings(req.file.buffer);
    
    console.log(`✅ [DEBUG] AI 回傳成功，找到 ${faces.length} 張臉`);

    if (faces.length === 0) {
      return res.status(400).json({ error: '找不到人臉，請重新拍攝' });
    }

    // 3. 準備搜尋向量 (將陣列轉字串)
    const targetVector = JSON.stringify(faces[0].embedding);
    
    // 4. 執行資料庫搜尋 (這就是最容易出錯的地方)
    // ⚠️ 關鍵修正：這裡強制加上 ::vector(512)
    console.log("🚀 [DEBUG] 開始執行 SQL 搜尋...");
    
    const photos = await prisma.$queryRaw`
      SELECT DISTINCT p.id, p.url, p."fileName", 
      (f.embedding <-> ${targetVector}::vector(512)) as distance
      FROM "Face" f 
      JOIN "Photo" p ON f."photoId" = p.id
      WHERE f.embedding <-> ${targetVector}::vector(512) < 0.6
      ORDER BY distance ASC 
      LIMIT 50;
    `;

    console.log(`🎉 [DEBUG] 搜尋完成！找到 ${photos.length} 張匹配照片`);
    
    // 5. 回傳結果
    res.json(photos);

  } catch (error) {
    // 6. 捕捉並顯示詳細錯誤
    console.error("❌❌❌ [嚴重錯誤] 搜尋失敗，原因如下：");
    console.error(error); // 這行會把具體錯誤印在日誌裡
    
    res.status(500).json({ 
      error: '搜尋過程發生錯誤', 
      details: error.message 
    });
  }
});

app.get('/photos', async (req, res) => {
    const photos = await prisma.photo.findMany({ orderBy: { createdAt: 'desc' }, include: { faces: { include: { person: true } } } });
    res.json(photos);
});

app.post('/name', async (req, res) => {
    const { faceId, name } = req.body;
    try {
      const result = await prisma.$transaction(async (tx) => {
        let person = await tx.person.findUnique({ where: { name } });
        if (!person) person = await tx.person.create({ data: { name } });
        const updatedFace = await tx.face.update({ where: { id: faceId }, data: { personId: person.id }, include: { person: true } });
        const autoTagCount = await tx.$executeRaw`
          UPDATE "Face" SET "personId" = ${person.id}
          WHERE "personId" IS NULL AND id != ${faceId}
          AND embedding <-> (SELECT embedding FROM "Face" WHERE id = ${faceId}) < 0.75; 
        `;
        return { face: updatedFace, count: autoTagCount };
      });
      res.json(result.face);
    } catch (error) { res.status(500).send("Naming failed"); }
});

app.get('/person/:name', async (req, res) => {
    const { name } = req.params;
    try {
      const person = await prisma.person.findUnique({
        where: { name },
        include: { faces: { include: { photo: { include: { faces: { include: { person: true } } } } } } }
      });
      if (!person) return res.json([]);
      const photos = person.faces.map(face => face.photo);
      const uniquePhotos = [...new Map(photos.map(p => [p.id, p])).values()];
      res.json(uniquePhotos);
    } catch (error) { res.status(500).send("Search failed"); }
});

server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});