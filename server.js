const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
    'https://fmphtnvppmarswiekmob.supabase.co', 
    'sb_publishable_ye6-oRCREVQJpwdN5dg4zA_YBBTARQk'
);

app.use(bodyParser.json());
app.use(express.static('public'));

// Hàm bổ trợ phân cấp độ
const getRank = (elo) => {
    if (elo < 500) return "Nhập môn";
    if (elo <= 700) return "Trung cấp";
    return "Cao cấp";
};

// --- API DÀNH CHO TẤT CẢ (CHỈ XEM) ---
app.get('/api/members', async (req, res) => {
    const { data, error } = await supabase.from('players').select('*').order('elo', { ascending: false });
    if (error) return res.status(500).send(error.message);
    
    // Gắn thêm thông tin cấp độ khi trả về dữ liệu cho người xem
    const enrichedData = data.map(p => ({
        ...p,
        rank: getRank(p.elo)
    }));
    res.json(enrichedData);
});

// --- API DÀNH CHO BAN ĐIỀU HÀNH (Cần bảo mật link Admin) ---

// 1. Thêm thành viên (Khởi điểm 600)
app.post('/api/admin/members', async (req, res) => {
    const { id, name } = req.body;
    const { error } = await supabase.from('players').insert([{ id, name, elo: 600 }]);
    if (error) return res.status(500).send(error.message);
    res.json({ message: "Đã thêm thành viên mới với 600đ!" });
});

// 2. Xử lý trận đấu (Logic kèo trên/dưới + Hoàn tác)
app.post('/api/admin/match', async (req, res) => {
    const { mtv1, mtv2, result } = req.body;
    const { data: ps } = await supabase.from('players').select('*').in('id', [mtv1, mtv2]);
    if (ps.length < 2) return res.status(404).send("MTV không tồn tại");

    let p1 = ps.find(x => x.id === mtv1);
    let p2 = ps.find(x => x.id === mtv2);
    let d1 = 0, d2 = 0;

    if (result === 'draw') {
        if (p1.elo === p2.elo) { d1 = 0; d2 = 0; }
        else if (p1.elo > p2.elo) { d1 = -3; d2 = 3; }
        else { d1 = 3; d2 = -3; }
    } else if (result === 'win1') {
        if (p1.elo === p2.elo) { d1 = 10; d2 = -10; }
        else if (p1.elo > p2.elo) { d1 = 5; d2 = -3; }
        else { d1 = 20; d2 = -15; }
    } else {
        if (p1.elo === p2.elo) { d1 = -10; d2 = 10; }
        else if (p2.elo > p1.elo) { d1 = -3; d2 = 5; }
        else { d1 = -15; d2 = 20; }
    }

    await supabase.from('logs').insert([{
        content: `Trận: ${p1.name} vs ${p2.name} (${result})`,
        old_data: { [mtv1]: p1.elo, [mtv2]: p2.elo }
    }]);

    await supabase.from('players').update({ elo: p1.elo + d1 }).eq('id', mtv1);
    await supabase.from('players').update({ elo: p2.elo + d2 }).eq('id', mtv2);
    res.json({ message: "Cập nhật trận đấu thành công!" });
});

// 3. Điểm danh
app.post('/api/admin/attendance', async (req, res) => {
    const { id, status } = req.body;
    const { data: p } = await supabase.from('players').select('*').eq('id', id).single();
    let change = (status === 'present') ? 10 : -10;

    await supabase.from('logs').insert([{
        content: `Điểm danh ${p.name}: ${status}`,
        old_data: { [id]: p.elo }
    }]);

    await supabase.from('players').update({ elo: p.elo + change }).eq('id', id);
    res.json({ message: "Điểm danh thành công!" });
});

// 4. Nhật ký & Hoàn tác
app.get('/api/admin/logs', async (req, res) => {
    const { data } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(15);
    res.json(data);
});

app.post('/api/admin/undo', async (req, res) => {
    const { data: log } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(1).single();
    if (!log) return res.status(404).send("Hết dữ liệu hoàn tác");

    for (const [id, elo] of Object.entries(log.old_data)) {
        await supabase.from('players').update({ elo }).eq('id', id);
    }
    await supabase.from('logs').delete().eq('id', log.id);
    res.json({ message: "Đã hoàn tác!" });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`CLB Chess Pro 2026 Live on ${PORT}`));