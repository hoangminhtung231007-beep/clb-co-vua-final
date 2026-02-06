const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = 'https://fmphtnvppmarswiekmob.supabase.co';
const supabaseKey = 'sb_publishable_ye6-oRCREVQJpwdN5dg4zA_YBBTARQk';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());
app.use(express.static('public'));

// Sửa từ 'players' thành 'members' để khớp với lỗi 404 bạn gặp
app.get('/api/members', async (req, res) => {
    const { data, error } = await supabase.from('players').select('*').order('elo', { ascending: false });
    if (error) return res.status(500).send(error.message);
    res.json(data);
});

app.post('/api/members', async (req, res) => {
    const { id, name, elo } = req.body; 
    const { data, error } = await supabase.from('players').insert([{ id, name, elo: parseInt(elo) || 1000 }]);
    if (error) return res.status(500).send(error.message);
    res.json({ message: "Thành công!" });
});

// Các API khác nếu web của bạn gọi
app.get('/api/ranking', async (req, res) => {
    const { data, error } = await supabase.from('players').select('*').order('elo', { ascending: false });
    res.json(data);
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Chạy tại port ${PORT}`));