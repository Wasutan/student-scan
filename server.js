// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, 'public')));

// โครงสร้างฐานข้อมูล
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        settings: { total: 10, pass: 9 }, // ค่าเริ่มต้น จัด 10 ผ่าน 9
        records: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');

// ------------------------------------------------------------------
// 1. หน้าจอแสดง QR Code (สำหรับให้ครูเปิดขึ้นโปรเจคเตอร์)
// ------------------------------------------------------------------
app.get('/admin', async (req, res) => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIp = 'localhost';

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
            }
        }
    }

    const scanUrl = `http://${localIp}:${PORT}/scan`;

    try {
        const qrImageBase64 = await QRCode.toDataURL(scanUrl);
        res.send(`
            <!DOCTYPE html>
            <html lang="th">
            <head>
                <meta charset="UTF-8">
                <title>QR Code กิจกรรม</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Prompt&display=swap" rel="stylesheet">
                <style>body { font-family: 'Prompt', sans-serif; }</style>
            </head>
            <body class="bg-gray-100 flex flex-col items-center justify-center min-h-screen">
                <div class="bg-white p-10 rounded-2xl shadow-2xl text-center border-t-8 border-indigo-600">
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">📸 เช็กชื่อบำเพ็ญประโยชน์</h1>
                    <p class="text-xl text-gray-600 mb-8">สแกน QR Code เพื่อเช็กชื่อ</p>
                    <img src="${qrImageBase64}" alt="QR Code" class="mx-auto w-80 h-80 border-4 border-gray-200 rounded-lg shadow-inner mb-6">
                    <p class="text-sm text-gray-400">เข้า URL: ${scanUrl}</p>
                </div>
                <a href="/dashboard" class="mt-8 bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition shadow-lg">
                    📋 ไปหน้าตั้งค่าเกณฑ์ / ดูรายชื่อ
                </a>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send('Error generating QR Code');
    }
});

// ------------------------------------------------------------------
// 2. ฝั่งเด็ก - หน้าฟอร์ม (ดึงจากไฟล์ /public/student_form.html)
// ------------------------------------------------------------------
app.get('/scan', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'student_form.html'));
});

app.post('/api/submit-entry', (req, res) => {
    const { student_id, fullname, student_class, student_room } = req.body;
    
    if (!student_id || !fullname || !student_class || !student_room) {
        return res.status(400).send('กรุณากรอกข้อมูลให้ครบถ้วน');
    }

    const db = readDB();
    const time = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    db.records.push({
        student_id: student_id.trim(),
        fullname: fullname.trim(),
        class: student_class.trim(),
        room: student_room.trim(),
        timestamp: time
    });
    writeDB(db);

    res.send(`
        <script>
            alert('บันทึกข้อมูลเรียบร้อยแล้วครับ!');
            window.location.href = '/success.html'; 
        </script>
    `);
});

// ------------------------------------------------------------------
// 3. API สำหรับบันทึกการตั้งค่าเกณฑ์
// ------------------------------------------------------------------
app.post('/api/update-settings', (req, res) => {
    const { total, pass } = req.body;
    const db = readDB();
    db.settings.total = parseInt(total);
    db.settings.pass = parseInt(pass);
    writeDB(db);
    res.json({ status: 'success', message: 'อัปเดตเกณฑ์สำเร็จ' });
});

// ------------------------------------------------------------------
// 4. หน้า Dashboard สำหรับครู (ตั้งเกณฑ์ + ดูสรุปยอด)
// ------------------------------------------------------------------
app.get('/dashboard', (req, res) => {
    const db = readDB();
    const { total, pass } = db.settings;
    
    // คำนวณยอดเด็กแต่ละคน
    const summary = {};
    db.records.forEach(r => {
        if (!summary[r.student_id]) {
            summary[r.student_id] = {
                student_id: r.student_id,
                fullname: r.fullname,
                class: r.class,
                room: r.room,
                count: 0
            };
        }
        summary[r.student_id].count += 1;
    });

    // เรียงคนที่เข้าบ่อยสุดขึ้นก่อน
    const studentList = Object.values(summary).sort((a, b) => b.count - a.count);

    let tableRows = '';
    studentList.forEach((entry, index) => {
        // เช็กสถานะว่าผ่านเกณฑ์ที่ตั้งไว้หรือไม่
        const isPassed = entry.count >= pass;
        const statusHtml = isPassed 
            ? `<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold border border-green-300">✅ ผ่านเกณฑ์</span>` 
            : `<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-semibold border border-red-300">❌ ขาดอีก ${pass - entry.count} ครั้ง</span>`;

        tableRows += `
            <tr class="border-b hover:bg-gray-50 transition">
                <td class="p-3 text-sm text-center">${index + 1}</td>
                <td class="p-3 text-sm font-semibold text-gray-700">${entry.student_id}</td>
                <td class="p-3 text-sm">${entry.fullname}</td>
                <td class="p-3 text-sm text-center">${entry.class}/${entry.room}</td>
                <td class="p-3 text-sm text-center font-bold text-indigo-600 text-lg">${entry.count} <span class="text-xs text-gray-400 font-normal">/ ${total}</span></td>
                <td class="p-3 text-sm text-center">${statusHtml}</td>
            </tr>
        `;
    });

    res.send(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="UTF-8">
            <title>ตั้งค่าเกณฑ์ & สรุปยอด</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <link href="https://fonts.googleapis.com/css2?family=Prompt&display=swap" rel="stylesheet">
            <style>body { font-family: 'Prompt', sans-serif; }</style>
        </head>
        <body class="bg-gray-100 p-6 md:p-12">
            <div class="max-w-6xl mx-auto">
                
                <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 class="text-2xl font-bold text-gray-800">📋 ระบบจัดการบำเพ็ญประโยชน์</h1>
                    <div class="space-x-2">
                        <a href="/admin" class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 shadow">🔙 กลับไปหน้า QR Code</a>
                    </div>
                </div>

                <!-- กล่องตั้งค่าเกณฑ์กิจกรรม -->
                <div class="bg-white p-6 rounded-xl shadow-lg border-t-4 border-amber-500 mb-6">
                    <h2 class="text-lg font-semibold mb-2 text-amber-700">⚙️ กำหนดเกณฑ์การผ่านกิจกรรม</h2>
                    <p class="text-sm text-gray-500 mb-4">กำหนดเป้าหมายว่าเด็กต้องเข้ากี่ครั้งถึงจะผ่าน ระบบจะอัปเดตสถานะในตารางด้านล่างให้อัตโนมัติ</p>
                    
                    <form id="settingsForm" class="flex flex-col sm:flex-row gap-4 items-end bg-amber-50 p-4 rounded-lg border border-amber-100">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700">จัดกิจกรรมทั้งหมด (ครั้ง)</label>
                            <input type="number" id="total" value="${total}" min="1" class="mt-1 p-2 border border-gray-300 rounded w-full focus:ring-2 focus:ring-amber-400 outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700">เกณฑ์ที่ต้องผ่าน (ครั้ง)</label>
                            <input type="number" id="pass" value="${pass}" min="1" class="mt-1 p-2 border border-gray-300 rounded w-full focus:ring-2 focus:ring-amber-400 outline-none">
                        </div>
                        <button type="submit" class="bg-amber-600 text-white font-bold px-6 py-2 rounded hover:bg-amber-700 shadow transition w-full sm:w-auto">
                            💾 บันทึกเกณฑ์ใหม่
                        </button>
                    </form>
                </div>
                
                <!-- ตารางสรุปรายชื่อเด็ก -->
                <div class="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                    <div class="bg-gray-800 text-white p-4 flex justify-between items-center">
                        <h2 class="font-semibold">ผลการเข้าร่วมกิจกรรมของนักเรียน</h2>
                        <span class="text-sm bg-gray-700 px-3 py-1 rounded-full">ยอดรวม ${studentList.length} คน</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-100 border-b">
                                <tr>
                                    <th class="p-3 text-sm text-gray-600 text-center">ลำดับ</th>
                                    <th class="p-3 text-sm text-gray-600">รหัสนักเรียน</th>
                                    <th class="p-3 text-sm text-gray-600">ชื่อ-นามสกุล</th>
                                    <th class="p-3 text-sm text-gray-600 text-center">ชั้น/ห้อง</th>
                                    <th class="p-3 text-sm text-gray-600 text-center">เข้าร่วม (ครั้ง)</th>
                                    <th class="p-3 text-sm text-gray-600 text-center">สถานะ (ตามเกณฑ์ ${pass})</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows || '<tr><td colspan="6" class="text-center p-8 text-gray-500">ยังไม่มีนักเรียนสแกนเข้ามา...</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <script>
                // สคริปต์ส่งข้อมูลไปตั้งค่าเกณฑ์ใหม่
                document.getElementById('settingsForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const total = document.getElementById('total').value;
                    const pass = document.getElementById('pass').value;

                    try {
                        const response = await fetch('/api/update-settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ total, pass })
                        });
                        const result = await response.json();
                        
                        if(result.status === 'success') {
                            Swal.fire({
                                icon: 'success',
                                title: 'บันทึกเกณฑ์สำเร็จ!',
                                text: 'กำลังคำนวณสถานะนักเรียนใหม่...',
                                timer: 1500,
                                showConfirmButton: false
                            }).then(() => {
                                window.location.reload(); // รีเฟรชหน้าเว็บเพื่ออัปเดตตาราง
                            });
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
    console.log(`🚀 รันระบบสำเร็จที่: http://localhost:${PORT}`);
    console.log(`👨‍🏫 เปิดหน้า QR สำหรับสแกนที่: http://localhost:${PORT}/admin`);
    console.log(`⚙️  ตั้งค่าเกณฑ์ / ดูรายชื่อที่: http://localhost:${PORT}/dashboard`);
});