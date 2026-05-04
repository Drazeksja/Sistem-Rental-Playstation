const pool = require('../db');

// ============================================================
// DASHBOARD CUSTOMER
// ============================================================
exports.getDashboard = async (req, res) => {
    try {
        const customerId = req.session.customerId;

        // Total reservasi milik customer ini
        const totalReservations = await pool.query(
            'SELECT COUNT(*) FROM reservations WHERE customer_id = $1 AND deleted_at IS NULL', [customerId]
        );

        // Total pengeluaran customer
        const totalSpent = await pool.query(`
            SELECT COALESCE(SUM(p.amount), 0) AS sum 
            FROM payments p
            JOIN reservations r ON p.reservation_id = r.id
            WHERE r.customer_id = $1 AND r.deleted_at IS NULL AND p.status = 'Paid'
        `, [customerId]);

        // Reservasi aktif hari ini
        const activeToday = await pool.query(`
            SELECT COUNT(*) FROM reservations 
            WHERE customer_id = $1 AND deleted_at IS NULL 
              AND reservation_date = CURRENT_DATE
        `, [customerId]);

        res.render('customer/dashboard', {
            username: req.session.username,
            role: req.session.role,
            stats: {
                totalReservations: parseInt(totalReservations.rows[0].count) || 0,
                totalSpent: parseInt(totalSpent.rows[0].sum) || 0,
                activeToday: parseInt(activeToday.rows[0].count) || 0
            }
        });
    } catch (err) {
        console.error('Customer Dashboard Error:', err);
        res.status(500).send('Error loading dashboard');
    }
};

// ============================================================
// LIHAT MEJA TERSEDIA (Read-Only)
// ============================================================
exports.getTables = async (req, res) => {
    try {
        const result = await pool.query(`
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
            WHERE t.deleted_at IS NULL 
            ORDER BY t.id ASC
        `);

        res.render('customer/tables', {
            tables: result.rows,
            username: req.session.username,
            role: req.session.role
        });
    } catch (err) {
        console.error('Customer getTables Error:', err);
        res.status(500).send('Database Error');
    }
};

// ============================================================
// RESERVASI — Buat & Lihat Riwayat (difilter customer_id)
// ============================================================
exports.getReservations = async (req, res) => {
    const customerId = req.session.customerId;
    try {
        const result = await pool.query(`
            SELECT r.id, t.table_number, r.reservation_date, r.start_time, r.duration,
                   p.status AS payment_status, p.amount,
                   CASE 
                       WHEN r.reservation_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date THEN 'Selesai'
                       WHEN r.reservation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time >= (r.start_time + (r.duration * interval '1 hour')) THEN 'Selesai'
                       WHEN r.reservation_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::date AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::time >= r.start_time THEN 'Sedang Main'
                       ELSE 'Menunggu'
                   END as play_status
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            JOIN payments p ON p.reservation_id = r.id
            WHERE r.customer_id = $1 AND r.deleted_at IS NULL
            ORDER BY r.reservation_date DESC, r.start_time DESC
        `, [customerId]);

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

        res.render('customer/reservations', {
            reservations: result.rows,
            tables: tables.rows,
            username: req.session.username,
            role: req.session.role
        });
    } catch (err) {
        console.error('Customer getReservations Error:', err);
        res.status(500).send('Database Error');
    }
};

// ============================================================
// BUAT RESERVASI BARU (Customer)
// ============================================================
exports.postReservation = async (req, res) => {
    const { table_id, reservation_date, start_time, duration, amount } = req.body;
    const customerId = req.session.customerId;

    if (!customerId) {
        return res.send('<script>alert("Sesi tidak valid. Silakan login ulang."); window.location="/auth/login";</script>');
    }

    // Validasi: Tanggal tidak boleh di masa lalu
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(reservation_date);
    if (selectedDate < today) {
        return res.send('<script>alert("Tanggal reservasi tidak boleh di masa lalu."); window.history.back();</script>');
    }

    // Validasi overlap
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

    // Cek meja bukan maintenance
    const tableCheck = await pool.query("SELECT status FROM tables WHERE id = $1 AND deleted_at IS NULL", [table_id]);
    if (tableCheck.rows.length === 0 || tableCheck.rows[0].status === 'Maintenance') {
        return res.send('<script>alert("Meja tidak tersedia atau sedang dalam maintenance."); window.history.back();</script>');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const resResult = await client.query(
            'INSERT INTO reservations (customer_id, table_id, reservation_date, start_time, duration) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [customerId, table_id, reservation_date, start_time, parseInt(duration)]
        );

        await client.query('INSERT INTO payments (reservation_id, amount, status) VALUES ($1, $2, $3)',
            [resResult.rows[0].id, parseInt(amount), 'Unpaid']);

        await client.query('COMMIT');
        res.redirect('/customer/reservations');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Customer postReservation Error:', err);
        res.redirect('/customer/reservations');
    } finally {
        client.release();
    }
};
