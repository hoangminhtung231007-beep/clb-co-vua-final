const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// KẾT NỐI SUPABASE
const supabaseUrl = 'https://fmphtnvppmarswiekmob.supabase.co';
const supabaseKey = 'sb_publishable_ye6-oRCREVQJpwdN5dg4zA_YBBTARQk';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());
app.use(express.static('public'));

// Hàm hỗ trợ phân cấp độ (Dưới 500: Nhập môn | 500-700: Trung cấp | Trên 700: Cao cấp)
const getRank = (elo) => {
    if (elo < 500) return "Nhập môn";
    if (elo <= 700) return "Trung cấp";
    return "Cao cấp";
};

// --- 1. LẤY DANH SÁCH & TÌM KIẾM (Cho cả Admin và Người xem) ---
app.get('/api/members', async (req, res) => {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('elo', { ascending: false });
    
    if (error) return res.status(500).send(error.message);
    
    const enrichedData = data.map(p => ({ ...p, rank: getRank(p.elo) }));
    res.json(enrichedData);
});

// --- 2. THÊM THÀNH VIÊN MỚI (Khởi đầu 600đ) ---
app.post('/api/members', async (req, res) => {
    const { id, name } = req.body; // id là MTV, name là Họ tên
    if (!id || !name) return res.status(400).send("Thiếu MTV hoặc Họ tên");

    const { error } = await supabase
        .from('players')
        .insert([{ id: id, name: name, elo: 600 }]);

    if (error) return res.status(500).send(error.message);
    res.json({ message: "Thêm thành công thành viên với 600 điểm!" });
});

// --- 3. XỬ LÝ TRẬN ĐẤU (Logic Elo bạn yêu cầu) ---
app.post('/api/match', async (req, res) => {
    const { mtv1, mtv2, result } = req.body;
    const { data: ps } = await supabase.from('players').select('*').in('id', [mtv1, mtv2]);
    
    if (!ps || ps.length < 2) return res.status(404).send("Không tìm thấy MTV");

    let p1 = ps.find(x => x.id === mtv1);
    let p2 = ps.find(x => x.id === mtv2);
    let d1 = 0, d2 = 0;

    // Logic cộng trừ điểm
    if (result === 'draw') { // Hòa
        if (p1.elo === p2.elo) { d1 = 0; d2 = 0; }
        else if (p1.elo > p2.elo) { d1 = -3; d2 = 3; } // Trên hòa dưới
        else { d1 = 3; d2 = -3; } // Dưới hòa trên
    } else if (result === 'win1') { // MTV1 thắng
        if (p1.elo === p2.elo) { d1 = 10; d2 = -10; }
        else if (p1.elo > p2.elo) { d1 = 5; d2 = -3; } // Trên thắng dưới
        else { d1 = 20; d2 = -15; } // Dưới thắng trên
    } else if (result === 'win2') { // MTV2 thắng
        if (p1.elo === p2.elo) { d1 = -10; d2 = 10; }
        else if (p2.elo > p1.elo) { d1 = -3; d2 = 5; } // Trên thắng dưới (p2 thắng)
        else { d1 = -15; d2 = 20; } // Dưới thắng trên (p2 thắng)
    }

    // Lưu Log để hoàn tác
    await supabase.from('logs').insert([{
        content: `Trận: ${p1.name} vs ${p2.name} (${result})`,
        old_data: { [mtv1]: p1.elo, [mtv2]: p2.elo }
    }]);

    // Cập nhật điểm vào Database
    await supabase.from('players').update({ elo: p1.elo + d1 }).eq('id', mtv1);
    await supabase.from('players').update({ elo: p2.elo + d2 }).eq('id', mtv2);
    
    res.json({ message: "Đã cập nhật điểm trận đấu!" });
});

// --- 4. ĐIỂM DANH ---
app.post('/api/attendance', async (req, res) => {
    const { id, status } = req.body; 
    const { data: p } = await supabase.from('players').select('*').eq('id', id).single();
    if (!p) return res.status(404).send("Không thấy MTV");

    let change = (status === 'present') ? 10 : -10;

    await supabase.from('logs').insert([{
        content: `Điểm danh ${p.name}: ${status}`,
        old_data: { [id]: p.elo }
    }]);

    await supabase.from('players').update({ elo: p.elo + change }).eq('id', id);
    res.json({ message: "Điểm danh thành công!" });
});

// --- 5 & 6. NHẬT KÝ & HOÀN TÁC ---
app.get('/api/logs', async (req, res) => {
    const { data } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(20);
    res.json(data);
});

app.post('/api/undo', async (req, res) => {
    const { data: lastLog } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(1).single();
    if (!lastLog) return res.status(404).send("Không có dữ liệu hoàn tác");

    for (const [id, elo] of Object.entries(lastLog.old_data)) {
        await supabase.from('players').update({ elo: elo }).eq('id', id);
    }
    await supabase.from('logs').delete().eq('id', lastLog.id);
    res.json({ message: "Đã hoàn tác thao tác cuối!" });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server chạy tại cổng ${PORT}`));