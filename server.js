const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// THÔNG TIN KẾT NỐI SUPABASE CỦA BẠN
const supabaseUrl = 'https://fmphtnvppmarswiekmob.supabase.co';
const supabaseKey = 'sb_publishable_ye6-oRCREVQJpwdN5dg4zA_YBBTARQk';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());
app.use(express.static('public'));

// 1. Lấy danh sách thành viên (Dùng cho trang chủ)
app.get('/api/players', async (req, res) => {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('elo', { ascending: false });
    
    if (error) return res.status(500).send(error.message);
    res.json(data);
});

// 2. Thêm thành viên mới (Dùng cho Admin)
app.post('/api/players', async (req, res) => {
    const { id, name, elo } = req.body; // Thêm 'id' vào đây để lấy từ ô nhập liệu
    
    const { data, error } = await supabase
        .from('players')
        .insert([{ 
            id: id,      // Gửi ID bạn nhập (ví dụ TV01)
            name: name, 
            elo: parseInt(elo) || 1000 
        }]);

    if (error) {
        console.error(error);
        return res.status(500).send(error.message);
    }
    res.json({ message: "Thêm thành công!" });
});
// 3. Cập nhật điểm Elo (Dùng cho Admin)
app.put('/api/players/:id', async (req, res) => {
    const { id } = req.params;
    const { elo } = req.body;
    const { data, error } = await supabase
        .from('players')
        .update({ elo: parseInt(elo) })
        .eq('id', id);

    if (error) return res.status(500).send(error.message);
    res.json({ message: "Cập nhật thành công!" });
});

// 4. Xóa thành viên
app.delete('/api/players/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('players')
        .delete()
        .eq('id', id);

    if (error) return res.status(500).send(error.message);
    res.json({ message: "Xóa thành công!" });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});