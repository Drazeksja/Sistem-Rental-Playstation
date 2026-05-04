const bcrypt = require('bcryptjs');
const pool = require('../db');

exports.getLogin = (req, res) => res.render('auth/login');
exports.getRegister = (req, res) => res.render('auth/register');

// ============================================================
// LOGIN — Cek dari tabel `users`, redirect sesuai role
// ============================================================
exports.postLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                req.session.userId = user.id;
                req.session.email = user.email;
                req.session.role = user.role;

                // Ambil nama untuk ditampilkan di navbar/dashboard
                if (user.role === 'admin') {
                    const admin = await pool.query('SELECT username FROM admins WHERE user_id = $1', [user.id]);
                    req.session.username = admin.rows.length > 0 ? admin.rows[0].username : user.email;
                    return res.redirect('/admin/dashboard');
                } else {
                    let cust = await pool.query('SELECT id, name FROM customers WHERE user_id = $1', [user.id]);
                    if (cust.rows.length === 0) {
                        // Jika profil tidak sengaja hilang/belum terbuat, buatkan default profile
                        const newCust = await pool.query(
                            'INSERT INTO customers (name, phone, user_id) VALUES ($1, $2, $3) RETURNING id, name',
                            [user.email.split('@')[0], '-', user.id]
                        );
                        cust = newCust;
                    }
                    req.session.username = cust.rows[0].name;
                    req.session.customerId = cust.rows[0].id;
                    return res.redirect('/customer/dashboard');
                }
            }
        }
        res.send('<script>alert("Login Gagal. Cek email/password Anda."); window.history.back();</script>');
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).send('Server Error');
    }
};

// ============================================================
// REGISTER — Sekarang untuk Customer (publik), Admin via seeder
// ============================================================
exports.postRegister = async (req, res) => {
    const { name, phone, email, password } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Buat akun di tabel users (role: customer)
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRes = await client.query(
            'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id',
            [email, hashedPassword, 'customer']
        );
        const userId = userRes.rows[0].id;

        // 2. Buat profil customer yang terhubung ke user_id
        await client.query(
            'INSERT INTO customers (name, phone, user_id) VALUES ($1, $2, $3)',
            [name, phone, userId]
        );

        await client.query('COMMIT');
        res.redirect('/auth/login');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Register Error:', err);
        if (err.code === '23505') {
            res.send('<script>alert("Email sudah terdaftar. Silakan login."); window.location="/auth/login";</script>');
        } else {
            res.send('<script>alert("Registrasi gagal. Silakan coba lagi."); window.history.back();</script>');
        }
    } finally {
        client.release();
    }
};

// ============================================================
// REGISTER ADMIN — Khusus admin (bisa diproteksi/hapus nanti)
// ============================================================
exports.getRegisterAdmin = (req, res) => res.render('auth/register-admin');

exports.postRegisterAdmin = async (req, res) => {
    const { username, password } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRes = await client.query(
            'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id',
            [username, hashedPassword, 'admin']
        );
        await client.query(
            'INSERT INTO admins (username, password, user_id) VALUES ($1, $2, $3)',
            [username, hashedPassword, userRes.rows[0].id]
        );
        await client.query('COMMIT');
        res.redirect('/auth/login');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Register Admin Error:', err);
        res.send('<script>alert("Username/email sudah dipakai."); window.history.back();</script>');
    } finally {
        client.release();
    }
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
};
