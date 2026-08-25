// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const QRCode = require('qrcode');
const multer = require('multer');
const { networkInterfaces } = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// ตั้งค่าที่เก็บรูปภาพ uploads
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `img-${req.body.student_id || 'student'}-${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// อ่าน-เขียน Database
const readDB = () => {
    try {
        let data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!data.settings) data.settings = { total: 10, pass: 9, mandatory_pass: 2 };
        if (data.settings.mandatory_pass === undefined) data.settings.mandatory_pass = 2;
        if (!data.records) data.records = [];
        return data;
    } catch (e) {
        return { settings: { total: 10, pass: 9, mandatory_pass: 2 }, records: [] };
    }
};

const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');

if (!fs.existsSync(DB_FILE)) {
    writeDB({ settings: { total: 10, pass: 9, mandatory_pass: 2 }, records: [] });
}

// ------------------------------------------------------------------
// 1. หน้าจอ Admin (ตั้งชื่อกิจกรรม & สร้าง QR Code)
// ------------------------------------------------------------------
app.get('/admin', async (req, res) => {
    const { activity, mandatory } = req.query;

    // หา Local IP เครื่องครู
    const nets = networkInterfaces();
    let localIp = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
            }
        }
    }

    // ถ้ายังไม่ได้ตั้งชื่อกิจกรรม ให้แสดงฟอร์มสร้าง QR
    if (!activity) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="th">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>สร้าง QR Code กิจกรรม</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Prompt&display=swap" rel="stylesheet">
                <style>body { font-family: 'Prompt', sans-serif; }</style>
            </head>
            <body class="bg-gray-100 flex items-center justify-center min-h-screen p-4">
                <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border-t-8 border-indigo-600">
                    <h1 class="text-2xl font-bold text-gray-800 mb-6 text-center">⚙️ สร้าง QR Code กิจกรรม</h1>
                    <form action="/admin" method="GET" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">ชื่อกิจกรรม</label>
                            <input type="text" name="activity" required placeholder="เช่น เก็บขยะรอบโรงเรียน"
                                class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none">
                        </div>
                        <div class="flex items-center gap-2 bg-amber-50 p-3 rounded-lg border border-amber-200">
                            <input type="checkbox" name="mandatory" value="true" id="mandatory" class="w-5 h-5 text-indigo-600">
                            <label for="mandatory" class="text-sm font-semibold text-amber-900 cursor-pointer">⭐ เป็นกิจกรรมบังคับหรือไม่?</label>
                        </div>
                        <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition shadow-md">
                            📸 สร้าง QR Code
                        </button>
                    </form>
                    <div class="mt-6 text-center">
                        <a href="/dashboard" class="text-sm text-gray-500 hover:text-indigo-600 underline">📋 ไปหน้า Dashboard / สรุปยอด</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    }

    // เมื่อระบุกิจกรรมแล้ว สร้าง QR Code ลิงก์ไปยัง /scan
    const isMandatory = mandatory === 'true';
    const scanUrl = `http://${localIp}:${PORT}/scan?activity=${encodeURIComponent(activity)}&mandatory=${isMandatory}`;

    try {
        const qrImageBase64 = await QRCode.toDataURL(scanUrl);
        res.send(`
            <!DOCTYPE html>
            <html lang="th">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QR Code: ${activity}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Prompt&display=swap" rel="stylesheet">
                <style>body { font-family: 'Prompt', sans-serif; }</style>
            </head>
            <body class="bg-gray-100 flex flex-col items-center justify-center min-h-screen p-4">
                <div class="bg-white p-8 rounded-2xl shadow-2xl text-center border-t-8 ${isMandatory ? 'border-amber-500' : 'border-indigo-600'} max-w-md w-full">
                    <div class="mb-3">
                        ${isMandatory ? '<span class="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold border border-amber-300">⭐ กิจกรรมบังคับ</span>' : '<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold border border-blue-300">📌 กิจกรรมทั่วไป</span>'}
                    </div>
                    <h1 class="text-2xl font-bold text-gray-800 mb-2">${activity}</h1>
                    <p class="text-sm text-gray-600 mb-6">ให้นักเรียนสแกน QR Code เพื่อส่งรูปและเช็กชื่อ</p>
                    <img src="${qrImageBase64}" alt="QR Code" class="mx-auto w-72 h-72 border-4 border-gray-200 rounded-lg shadow-inner mb-4">
                    <p class="text-xs text-gray-400 break-all">URL: ${scanUrl}</p>
                </div>
                <div class="mt-6 space-x-3">
                    <a href="/admin" class="bg-gray-700 text-white px-5 py-2 rounded-lg hover:bg-gray-800 transition shadow">🔙 เปลี่ยนกิจกรรม</a>
                    <a href="/dashboard" class="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 transition shadow">📋 ดูสรุปยอด</a>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send('Error generating QR Code');
    }
});

// ------------------------------------------------------------------
// 2. ฝั่งนักเรียน - Form & Submit Photo
// ------------------------------------------------------------------
app.get('/scan', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'student_form.html'));
});

app.post('/api/submit-entry', upload.single('photo'), (req, res) => {
    const { student_id, fullname, student_class, student_room, activity_name, is_mandatory } = req.body;

    if (!student_id || !fullname || !student_class || !student_room) {
        return res.status(400).send('กรุณากรอกข้อมูลให้ครบถ้วน');
    }

    const db = readDB();
    const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    db.records.push({
        student_id: student_id.trim(),
        fullname: fullname.trim(),
        class: student_class.trim(),
        room: student_room.trim(),
        activity_name: activity_name || 'กิจกรรมทั่วไป',
        is_mandatory: is_mandatory === 'true',
        photo_url: photoUrl,
        timestamp: time
    });
    writeDB(db);

    res.send(`
        <script>
            alert('บันทึกข้อมูลและอัปโหลดรูปภาพเรียบร้อยแล้ว!');
            window.location.href = '/success.html';
        </script>
    `);
});

// ------------------------------------------------------------------
// 3. API อัปเดตเกณฑ์
// ------------------------------------------------------------------
app.post('/api/update-settings', (req, res) => {
    const { total, pass, mandatory_pass } = req.body;
    const db = readDB();
    db.settings.total = parseInt(total) || 10;
    db.settings.pass = parseInt(pass) || 9;
    db.settings.mandatory_pass = parseInt(mandatory_pass) || 0;
    writeDB(db);
    res.json({ status: 'success', message: 'อัปเดตเกณฑ์สำเร็จ' });
});

// ------------------------------------------------------------------
// 4. หน้า Dashboard สรุปผล
// ------------------------------------------------------------------
app.get('/dashboard', (req, res) => {
    const db = readDB();
    const { total, pass, mandatory_pass } = db.settings;

    const summary = {};
    db.records.forEach(r => {
        if (!summary[r.student_id]) {
            summary[r.student_id] = {
                student_id: r.student_id,
                fullname: r.fullname,
                class: r.class,
                room: r.room,
                count: 0,
                mandatory_count: 0,
                photos: []
            };
        }
        summary[r.student_id].count += 1;
        if (r.is_mandatory) summary[r.student_id].mandatory_count += 1;
        if (r.photo_url) {
            summary[r.student_id].photos.push({
                activity: r.activity_name,
                url: r.photo_url,
                time: r.timestamp
            });
        }
    });

    const studentList = Object.values(summary).sort((a, b) => b.count - a.count);

    let tableRows = '';
    studentList.forEach((entry, index) => {
        const isPassed = (entry.count >= pass) && (entry.mandatory_count >= mandatory_pass);
        
        let statusHtml = '';
        if (isPassed) {
            statusHtml = `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold border border-green-300">✅ ผ่านเกณฑ์</span>`;
        } else {
            const lackTotal = Math.max(0, pass - entry.count);
            const lackMandatory = Math.max(0, mandatory_pass - entry.mandatory_count);
            statusHtml = `<span class="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold border border-red-300">❌ ขาดรวม ${lackTotal} / ขาดบังคับ ${lackMandatory}</span>`;
        }

        const photoHtml = entry.photos.length > 0
            ? `<a href="${entry.photos[entry.photos.length - 1].url}" target="_blank" class="text-indigo-600 hover:underline font-semibold text-xs">📸 ดูรูปภาพ (${entry.photos.length})</a>`
            : `<span class="text-gray-400 text-xs">-</span>`;

        tableRows += `
            <tr class="border-b hover:bg-gray-50 transition">
                <td class="p-3 text-sm text-center">${index + 1}</td>
                <td class="p-3 text-sm font-semibold text-gray-700">${entry.student_id}</td>
                <td class="p-3 text-sm">${entry.fullname}</td>
                <td class="p-3 text-sm text-center">${entry.class}/${entry.room}</td>
                <td class="p-3 text-sm text-center font-bold text-indigo-600">${entry.count} / ${total}</td>
                <td class="p-3 text-sm text-center font-bold text-amber-600">${entry.mandatory_count} / ${mandatory_pass}</td>
                <td class="p-3 text-sm text-center">${statusHtml}</td>
                <td class="p-3 text-sm text-center">${photoHtml}</td>
            </tr>
        `;
    });

    res.send(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ตั้งค่าเกณฑ์ & สรุปยอด</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <link href="https://fonts.googleapis.com/css2?family=Prompt&display=swap" rel="stylesheet">
            <style>body { font-family: 'Prompt', sans-serif; }</style>
        </head>
        <body class="bg-gray-100 p-4 md:p-8">
            <div class="max-w-6xl mx-auto">
                <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 class="text-2xl font-bold text-gray-800">📋 ระบบจัดการบำเพ็ญประโยชน์</h1>
                    <a href="/admin" class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow transition text-sm">🔙 หน้าสร้าง QR Code</a>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-lg border-t-4 border-amber-500 mb-6">
                    <h2 class="text-base font-semibold mb-2 text-amber-700">⚙️ กำหนดเกณฑ์การผ่านกิจกรรม</h2>
                    <form id="settingsForm" class="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                        <div>
                            <label class="block text-xs font-semibold text-gray-600">จัดกิจกรรมทั้งหมด (ครั้ง)</label>
                            <input type="number" id="total" value="${total}" min="1" class="mt-1 p-2 border rounded w-full outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-600">ต้องผ่านรวม (ครั้ง)</label>
                            <input type="number" id="pass" value="${pass}" min="1" class="mt-1 p-2 border rounded w-full outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-amber-700">ต้องผ่านกิจกรรมบังคับ (ครั้ง)</label>
                            <input type="number" id="mandatory_pass" value="${mandatory_pass}" min="0" class="mt-1 p-2 border border-amber-300 rounded w-full bg-amber-50 outline-none focus:ring-2 focus:ring-amber-400">
                        </div>
                        <button type="submit" class="bg-amber-600 text-white font-bold py-2 px-4 rounded hover:bg-amber-700 shadow transition">
                            💾 บันทึกเกณฑ์
                        </button>
                    </form>
                </div>

                <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                    <div class="bg-gray-800 text-white p-4 flex justify-between items-center">
                        <h2 class="font-semibold text-sm md:text-base">ผลการเข้าร่วมกิจกรรมของนักเรียน</h2>
                        <span class="text-xs bg-gray-700 px-3 py-1 rounded-full">รวม ${studentList.length} คน</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-100 border-b">
                                <tr>
                                    <th class="p-3 text-xs text-gray-600 text-center">ลำดับ</th>
                                    <th class="p-3 text-xs text-gray-600">รหัส</th>
                                    <th class="p-3 text-xs text-gray-600">ชื่อ-นามสกุล</th>
                                    <th class="p-3 text-xs text-gray-600 text-center">ชั้น/ห้อง</th>
                                    <th class="p-3 text-xs text-gray-600 text-center">เข้าร่วมรวม</th>
                                    <th class="p-3 text-xs text-amber-700 text-center">กิจกรรมบังคับ</th>
                                    <th class="p-3 text-xs text-gray-600 text-center">สถานะ</th>
                                    <th class="p-3 text-xs text-gray-600 text-center">หลักฐาน</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows || '<tr><td colspan="8" class="text-center p-8 text-gray-500 text-sm">ยังไม่มีข้อมูลนักเรียนสแกนเข้ามา...</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <script>
                document.getElementById('settingsForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const total = document.getElementById('total').value;
                    const pass = document.getElementById('pass').value;
                    const mandatory_pass = document.getElementById('mandatory_pass').value;

                    try {
                        const response = await fetch('/api/update-settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ total, pass, mandatory_pass })
                        });
                        const result = await response.json();
                        if(result.status === 'success') {
                            Swal.fire({
                                icon: 'success',
                                title: 'บันทึกเกณฑ์สำเร็จ!',
                                timer: 1200,
                                showConfirmButton: false
                            }).then(() => window.location.reload());
                        }
                    } catch(err) {
                        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถบันทึกเกณฑ์ได้', 'error');
                    }
                });
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`🚀 เซิร์ฟเวอร์ทำงานแล้วที่: http://localhost:${PORT}`);
    console.log(`👨‍🏫 หน้า Admin สร้าง QR Code: http://localhost:${PORT}/admin`);
    console.log(`⚙️  หน้า Dashboard สรุปยอด: http://localhost:${PORT}/dashboard`);
});
