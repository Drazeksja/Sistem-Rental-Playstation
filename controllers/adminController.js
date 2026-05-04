const pool = require('../db');

// ============================================================
// DASHBOARD — Analytics dengan Chart.js
// ============================================================
exports.getDashboard = async (req, res) => {
    try {
        const totalCustomers = await pool.query('SELECT COUNT(*) FROM customers');
        const avgDuration = await pool.query('SELECT COALESCE(AVG(duration), 0) AS avg FROM reservations WHERE deleted_at IS NULL');
        const totalIncome = await pool.query("SELECT COALESCE(SUM(amount), 0) AS sum FROM payments WHERE status = 'Paid'");
        const totalTables = await pool.query('SELECT COUNT(*) FROM tables WHERE deleted_at IS NULL');

        const salesTrend = await pool.query(`
            SELECT TO_CHAR(reservation_date, 'DD/MM') AS label, COUNT(*) AS total 
            FROM reservations 
            WHERE deleted_at IS NULL AND reservation_date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY reservation_date, label ORDER BY reservation_date ASC
        `);

        const popularConsoles = await pool.query(`
            SELECT 
                CASE 
                    WHEN t.table_number ILIKE 'PS5%' THEN 'PlayStation 5'
                    WHEN t.table_number ILIKE 'PS4%' THEN 'PlayStation 4'
                    WHEN t.table_number ILIKE 'PS3%' THEN 'PlayStation 3'
                    ELSE 'Lainnya'
                END AS console_type,
                COUNT(r.id) AS total_usage
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            WHERE r.deleted_at IS NULL
            GROUP BY 1 ORDER BY total_usage DESC LIMIT 4
        `);

        res.render('dashboard', { 
            username: req.session.username,
            stats: {
                customers: parseInt(totalCustomers.rows[0].count) || 0,
                avgDuration: parseFloat(avgDuration.rows[0].avg || 0).toFixed(1),
                income: parseInt(totalIncome.rows[0].sum) || 0,
                tables: parseInt(totalTables.rows[0].count) || 0
            },
            salesLabels: salesTrend.rows.map(r => r.label),
            salesData: salesTrend.rows.map(r => parseInt(r.total)),
            consoleLabels: popularConsoles.rows.map(r => r.console_type),
            consoleData: popularConsoles.rows.map(r => parseInt(r.total_usage))
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).send('Error loading dashboard');
    }
};

// ============================================================
// MANAJEMEN MEJA — CRUD + Soft Delete + Restore + Hard Delete
// ============================================================
exports.getTables = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.id, t.table_number, t.deleted_at,
                CASE 
                    WHEN t.status = 'Maintenance' THEN 'Maintenance'
                    WHEN EXISTS (
                        SELECT 1 FROM reservations r 
                        WHERE r.table_id = t.id 
                          AND r.deleted_at IS NULL
                          AND r.reservation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
                          AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time >= r.start_time 
                          AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time < (r.start_time + (r.duration * interval '1 hour'))
                    ) THEN 'In Use'
                    ELSE 'Available'
                END as status
            FROM tables t 
            WHERE t.deleted_at IS NULL 
            ORDER BY t.id ASC
        `);
        const trashCount = await pool.query('SELECT COUNT(*) FROM tables WHERE deleted_at IS NOT NULL');
        res.render('tables/index', { 
            tables: result.rows,
            trashCount: parseInt(trashCount.rows[0].count) || 0
        });
    } catch (err) {
        console.error('getTables Error:', err);
        res.status(500).send('Database Error');
    }
};

exports.getTrashedTables = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tables WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
        res.render('tables/trash', { trashedTables: result.rows });
    } catch (err) {
        console.error('getTrashedTables Error:', err);
        res.status(500).send('Database Error');
    }
};

exports.postTable = async (req, res) => {
    try {
        const { table_number } = req.body;
        await pool.query('INSERT INTO tables (table_number, status) VALUES ($1, $2)', [table_number, 'Available']);
        res.redirect('/admin/tables');
    } catch (err) {
        console.error('postTable Error:', err);
        res.redirect('/admin/tables');
    }
};

exports.updateTable = async (req, res) => {
    try {
        const { table_number, status } = req.body;
        await pool.query(
            'UPDATE tables SET table_number = $1, status = $2 WHERE id = $3 AND deleted_at IS NULL', 
            [table_number, status, req.params.id]
        );
        res.redirect('/admin/tables');
    } catch (err) {
        console.error('updateTable Error:', err);
        res.redirect('/admin/tables');
    }
};

exports.softDeleteTable = async (req, res) => {
    try {
        await pool.query('UPDATE tables SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
        res.redirect('/admin/tables');
    } catch (err) {
        console.error('softDeleteTable Error:', err);
        res.redirect('/admin/tables');
    }
};

exports.restoreTable = async (req, res) => {
    try {
        await pool.query('UPDATE tables SET deleted_at = NULL WHERE id = $1', [req.params.id]);
        res.redirect('/admin/tables/trash');
    } catch (err) {
        console.error('restoreTable Error:', err);
        res.redirect('/admin/tables/trash');
    }
};

exports.permanentDeleteTable = async (req, res) => {
    try {
        await pool.query('DELETE FROM tables WHERE id = $1', [req.params.id]);
        res.redirect('/admin/tables/trash');
    } catch (err) {
        console.error('permanentDeleteTable Error:', err);
        res.redirect('/admin/tables/trash');
    }
};

// ============================================================
// MANAJEMEN RESERVASI — JOIN 4 Tabel + Filter + Soft Delete
// ============================================================
exports.getReservations = async (req, res) => {
    const { search, date, payment_status } = req.query;
    
    // JOIN antara reservations, customers, tables, dan payments
    let query = `
        SELECT r.id, c.name AS customer_name, c.phone AS customer_phone, 
               t.table_number, r.reservation_date, r.start_time, r.duration,
               p.status AS payment_status, p.amount,
               CASE 
                   WHEN r.reservation_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date THEN 'Selesai'
                   WHEN r.reservation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time >= (r.start_time + (r.duration * interval '1 hour')) THEN 'Selesai'
                   WHEN r.reservation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time >= r.start_time THEN 'Sedang Main'
                   ELSE 'Menunggu'
               END as play_status
        FROM reservations r
        JOIN customers c ON r.customer_id = c.id
        JOIN tables t ON r.table_id = t.id
        JOIN payments p ON p.reservation_id = r.id
        WHERE r.deleted_at IS NULL
    `;
    
    let queryParams = []; 
    let paramIndex = 1;

    // Filter dinamis berdasarkan pencarian
    if (search) {
        query += ` AND c.name ILIKE $${paramIndex++}`;
        queryParams.push(`%${search}%`);
    }
    if (date) {
        query += ` AND r.reservation_date = $${paramIndex++}`;
        queryParams.push(date);
    }
    if (payment_status) {
        query += ` AND p.status = $${paramIndex++}`;
        queryParams.push(payment_status);
    }

    query += ` ORDER BY r.id DESC`;

    try {
        const result = await pool.query(query, queryParams);
        const tables = await pool.query(`
            SELECT t.id, t.table_number,
                CASE 
                    WHEN t.status = 'Maintenance' THEN 'Maintenance'
                    WHEN EXISTS (
                        SELECT 1 FROM reservations r 
                        WHERE r.table_id = t.id 
                          AND r.deleted_at IS NULL
                          AND r.reservation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date
                          AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time >= r.start_time 
                          AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time < (r.start_time + (r.duration * interval '1 hour'))
                    ) THEN 'In Use'
                    ELSE 'Available'
                END as status
            FROM tables t 
            WHERE t.deleted_at IS NULL AND t.status != 'Maintenance' 
            ORDER BY t.table_number ASC
        `);
        const trashCount = await pool.query('SELECT COUNT(*) FROM reservations WHERE deleted_at IS NOT NULL');
        
        res.render('reservations/index', { 
            reservations: result.rows, 
            tables: tables.rows, 
            search: search || '', 
            date: date || '', 
            payment_status: payment_status || '',
            trashCount: parseInt(trashCount.rows[0].count) || 0
        });
    } catch (err) {
        console.error('getReservations Error:', err);
        res.status(500).send('Database Error: ' + err.message);
    }
};

exports.getTrashedReservations = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.deleted_at, c.name AS customer_name, t.table_number, 
                   r.reservation_date, r.start_time, r.duration, p.amount
            FROM reservations r
            JOIN customers c ON r.customer_id = c.id
            JOIN tables t ON r.table_id = t.id
            JOIN payments p ON p.reservation_id = r.id
            WHERE r.deleted_at IS NOT NULL
            ORDER BY r.deleted_at DESC
        `);
        res.render('reservations/trash', { trashedReservations: result.rows });
    } catch (err) {
        console.error('getTrashedReservations Error:', err);
        res.status(500).send('Database Error');
    }
};

exports.postReservation = async (req, res) => {
    const { customer_name, phone, table_id, reservation_date, start_time, duration, amount } = req.body;
    
    // Validasi: Tanggal tidak boleh di masa lalu
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(reservation_date);
    if (selectedDate < today) {
        return res.send('<script>alert("Salah Tanggal Boss."); window.history.back();</script>');
    }

    // Validasi: Cek bentrok waktu (overlap) di meja dan tanggal yang sama
    const overlapCheck = await pool.query(`
        SELECT id FROM reservations 
        WHERE table_id = $1 
          AND reservation_date = $2 
          AND deleted_at IS NULL
          AND start_time < ($3::time + ($4::int * interval '1 hour'))
          AND (start_time + (duration * interval '1 hour')) > $3::time
    `, [table_id, reservation_date, start_time, duration]);

    if (overlapCheck.rows.length > 0) {
        return res.send('<script>alert("Maaf, Meja sudah direservasi pada waktu tersebut. Silakan pilih meja atau waktu lain."); window.history.back();</script>');
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Cari atau buat data Customer
        let custRes = await client.query('SELECT id FROM customers WHERE name = $1 AND phone = $2', [customer_name, phone]);
        if (custRes.rows.length === 0) {
            custRes = await client.query('INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id', 
                [customer_name, phone]);
        }
        const customer_id = custRes.rows[0].id;

        // 2. Simpan Reservasi
        const resResult = await client.query(
            'INSERT INTO reservations (customer_id, table_id, reservation_date, start_time, duration) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [customer_id, table_id, reservation_date, start_time, parseInt(duration)]
        );
        
        // 3. Buat Pembayaran (Default: Unpaid — COD)
        await client.query('INSERT INTO payments (reservation_id, amount, status) VALUES ($1, $2, $3)', 
            [resResult.rows[0].id, parseInt(amount), 'Unpaid']);

        await client.query('COMMIT');
        res.redirect('/admin/reservations');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('postReservation Error:', err);
        res.redirect('/admin/reservations');
    } finally {
        client.release();
    }
};

exports.updatePayment = async (req, res) => {
    try {
        // Konfirmasi pembayaran tunai (COD)
        await pool.query('UPDATE payments SET status = $1 WHERE reservation_id = $2', ['Paid', req.params.id]);
        res.redirect('/admin/reservations');
    } catch (err) {
        console.error('updatePayment Error:', err);
        res.redirect('/admin/reservations');
    }
};

exports.softDeleteReservation = async (req, res) => {
    try {
        // Soft Delete: data tetap ada di database untuk audit
        await pool.query('UPDATE reservations SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
        res.redirect('/admin/reservations');
    } catch (err) {
        console.error('softDeleteReservation Error:', err);
        res.redirect('/admin/reservations');
    }
};

exports.restoreReservation = async (req, res) => {
    try {
        await pool.query('UPDATE reservations SET deleted_at = NULL WHERE id = $1', [req.params.id]);
        res.redirect('/admin/reservations/trash');
    } catch (err) {
        console.error('restoreReservation Error:', err);
        res.redirect('/admin/reservations/trash');
    }
};

exports.permanentDeleteReservation = async (req, res) => {
    try {
        // Hard Delete: hapus permanen dari database
        await pool.query('DELETE FROM payments WHERE reservation_id = $1', [req.params.id]);
        await pool.query('DELETE FROM reservations WHERE id = $1', [req.params.id]);
        res.redirect('/admin/reservations/trash');
    } catch (err) {
        console.error('permanentDeleteReservation Error:', err);
        res.redirect('/admin/reservations/trash');
    }
};
