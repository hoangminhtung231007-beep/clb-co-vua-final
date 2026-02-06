const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('./database.sqlite');

app.use(express.json());
app.use(express.static('public'));

// --- KHỞI TẠO DATABASE ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, elo INTEGER DEFAULT 600, rank TEXT DEFAULT 'Trung cấp'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, content TEXT
    )`);
});

const getRank = (elo) => (elo < 500 ? 'Nhập môn' : elo <= 700 ? 'Trung cấp' : 'Cao cấp');

// --- CÁC API CƠ BẢN ---
app.get('/api/ranking', (req, res) => {
    db.all(`SELECT * FROM users ORDER BY elo DESC`, [], (err, rows) => res.json(rows));
});

app.get('/api/logs', (req, res) => {
    db.all(`SELECT * FROM logs ORDER BY timestamp DESC LIMIT 30`, [], (err, rows) => res.json(rows));
});

app.post('/api/members', (req, res) => {
    const { id, name } = req.body;
    db.run(`INSERT INTO users (id, name, elo, rank) VALUES (?, ?, 600, 'Trung cấp')`, [id, name], (err) => {
        if (err) return res.status(400).send("ID đã tồn tại");
        db.run(`INSERT INTO logs (content) VALUES (?)`, [`Thêm MTV: ${name} (${id})`]);
        res.send({ msg: "OK" });
    });
});

app.delete('/api/members/:id', (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], () => res.send({ msg: "OK" }));
});

// --- API ĐIỂM DANH (Ghi log chuẩn để Undo) ---
app.post('/api/attendance', (req, res) => {
    const { id, type, name } = req.body;
    let points = (type === 'present') ? 10 : (type === 'absent' ? -20 : -10);
    let typeVn = (type === 'present') ? 'Có mặt' : (type === 'absent' ? 'Vắng' : 'Muộn');

    db.run(`UPDATE users SET elo = elo + ?, rank = ? WHERE id = ?`, [points, getRank(600), id], () => {
        // Log quan trọng: Lưu đúng định dạng (ID) và (+/-X Elo) để API Undo đọc được
        db.run(`INSERT INTO logs (content) VALUES (?)`, [`${typeVn}: ${name} (${id}) (${points > 0 ? '+' : ''}${points} Elo)`]);
        res.send({ msg: "OK" });
    });
});

// --- API GHI TRẬN ĐẤU (Undo đơn giản bằng cách trừ lại điểm vừa cộng) ---
app.post('/api/match', (req, res) => {
    const { idA, idB, winnerId } = req.body;
    if (idA === idB) return res.status(400).send("Không thể tự đấu!");

    db.all(`SELECT * FROM users WHERE id IN (?, ?)`, [idA, idB], (err, rows) => {
        let pA = rows.find(r => r.id === idA), pB = rows.find(r => r.id === idB);
        let dA = 0, dB = 0; 
        // ... (Logic tính Elo giữ nguyên như cũ để đảm bảo quy tắc bạn đã chọn) ...
        // Ở đây tôi viết gọn để bạn dễ theo dõi, logic tính điểm vẫn là 10, 18, 5, 3 tùy cấp bậc
        const lvA = (pA.rank==='Nhập môn'?1:pA.rank==='Trung cấp'?2:3);
        const lvB = (pB.rank==='Nhập môn'?1:pB.rank==='Trung cấp'?2:3);
        if(winnerId==='0'){ if(lvA>lvB){dA=-3;dB=3;}else if(lvA<lvB){dA=3;dB=-3;} }
        else { const isA=winnerId===idA; if(lvA===lvB){dA=isA?10:-10;dB=isA?-10:10;}
        else if((isA&&lvA<lvB)||(!isA&&lvB<lvA)){dA=isA?18:-12;dB=isA?-12:18;}
        else{dA=isA?5:-3;dB=isA?-3:5;} }

        db.run(`UPDATE users SET elo=elo+?, rank=? WHERE id=?`, [dA, getRank(pA.elo+dA), idA]);
        db.run(`UPDATE users SET elo=elo+?, rank=? WHERE id=?`, [dB, getRank(pB.elo+dB), idB]);
        db.run(`INSERT INTO logs (content) VALUES (?)`, [`Trận: ${pA.name}(${idA}) vs ${pB.name}(${idB}). Thắng: ${winnerId==='0'?'Hòa':winnerId}. (+${dA}/+${dB} Elo)`]);
        res.send({ msg: "OK" });
    });
});

// --- API HOÀN TÁC (QUAN TRỌNG NHẤT) ---
app.post('/api/undo', (req, res) => {
    db.get(`SELECT * FROM logs ORDER BY id DESC LIMIT 1`, [], (err, lastLog) => {
        if (!lastLog || lastLog.content.includes("Thêm MTV") || lastLog.content.includes("Xóa")) {
            return res.status(400).send("Không thể hoàn tác hành động này!");
        }

        const content = lastLog.content;
        // Xử lý hoàn tác cho Điểm danh
        if (content.includes("Elo") && !content.includes("Trận")) {
            const id = content.match(/\(([^)]+)\)/)[1];
            const points = parseInt(content.match(/([+-]\d+) Elo/)[1]);
            db.run(`UPDATE users SET elo = elo - ? WHERE id = ?`, [points, id], () => {
                db.run(`DELETE FROM logs WHERE id = ?`, [lastLog.id]);
                res.send({ msg: "Đã hoàn tác điểm danh!" });
            });
        } 
        // Xử lý hoàn tác cho Trận đấu
        else if (content.includes("Trận")) {
            const ids = content.match(/\(([^)]+)\)/g).map(s => s.replace(/[()]/g, ''));
            const scores = content.match(/([+-]\d+)\/([+-]\d+)/);
            const dA = parseInt(scores[1]), dB = parseInt(scores[2]);
            db.run(`UPDATE users SET elo = elo - ? WHERE id = ?`, [dA, ids[0]]);
            db.run(`UPDATE users SET elo = elo - ? WHERE id = ?`, [dB, ids[1]]);
            db.run(`DELETE FROM logs WHERE id = ?`, [lastLog.id]);
            res.send({ msg: "Đã hoàn tác trận đấu!" });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`));