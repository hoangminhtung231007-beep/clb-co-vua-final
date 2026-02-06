const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// THÔNG TIN KẾT NỐI SUPABASE
const supabaseUrl = 'https://fmphtnvppmarswiekmob.supabase.co';
const supabaseKey = 'sb_publishable_ye6-oRCREVQJpwdN5dg4zA_YBBTARQk';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());
app.use(express.static('public'));

// 1. LẤY DANH SÁCH THÀNH VIÊN (Dùng cho cả Trang chủ và Admin)
// Khớp với đường dẫn /api/members để sửa lỗi 404
app.get('/api/members', async (req, res) => {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('elo', { ascending: false });
    
    if (error) return res.status(500).send(error.message);
    res.json(data);
});

// 2. THÊM THÀNH VIÊN MỚI
app.post('/api/members', async (req, res) => {
    const { id, name, elo } = req.body;
    
    // Nếu bạn không nhập điểm Elo, nó sẽ lấy giá trị bạn muốn (ví dụ 0 hoặc số khác)
    // Bạn có thể đổi số 0 ở dòng dưới thành mức điểm bạn quy định
    const finalElo = (elo !== undefined && elo !== "") ? parseInt(elo) : 0;

    const { data, error } = await supabase
        .from('players')
        .insert([{ 
            id: id,      // Chấp nhận ID dạng chữ như TV01
            name: name, 
            elo: finalElo 
        }]);

    if (error) return res.status(500).send(error.message);
    res.json({ message: "Thêm thành công!" });
});

// 3. CẬP NHẬT ĐIỂM ELO (Dùng cho nút Cập Nhật trong Admin)
app.put('/api/members/:id', async (req, res) => {
    const { id } = req.params;
    const { elo } = req.body;
    
    const { data, error } = await supabase
        .from('players')
        .update({ elo: parseInt(elo) })
        .eq('id', id);

    if (error) return res.status(500).send(error.message);
    res.json({ message: "Cập nhật thành công!" });
});

// 4. XÓA THÀNH VIÊN
app.delete('/api/members/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('players')
        .delete()
        .eq('id', id);

    if (error) return res.status(500).send(error.message);
    res.json({ message: "Xóa thành công!" });
});

// 5. ĐƯỜNG DẪN DỰ PHÒNG (Cho bảng xếp hạng nếu gọi /api/ranking)
app.get('/api/ranking', async (req, res) => {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('elo', { ascending: false });
    res.json(data);
});

// Điều hướng mọi yêu cầu khác về trang chủ
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server đang chạy cực mượt tại cổng ${PORT}`);
});