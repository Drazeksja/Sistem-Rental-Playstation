# Sistem Rental PS UNDIP Tembalang

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/EJS-B4CA65?style=for-the-badge&logo=ejs&logoColor=white" alt="EJS">
  <img src="https://img.shields.io/badge/Bootstrap-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white" alt="Bootstrap">
  <img src="https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white" alt="Chart.js">
</p>

Aplikasi web untuk mengelola penyewaan konsol PlayStation di kawasan UNDIP Tembalang, mendukung **dua aktor** (Admin & Customer) dengan hak akses terpisah. Dilengkapi dashboard analitik, validasi bentrok jadwal, serta mekanisme soft delete.

----

## Daftar Isi
- [Fitur Utama](#fitur-utama)
- [Aktor & Batasan Akses](#aktor--batasan-akses)
- [Skema Database](#skema-database)
- [DDL SQL – Struktur Tabel Lengkap](#ddl-sql--struktur-tabel-lengkap)
- [Tech Stack](#tech-stack)
- [Instalasi & Menjalankan Lokal](#instalasi--menjalankan-lokal)
- [Struktur Proyek](#struktur-proyek)
- [Konfigurasi Environment Variables](#konfigurasi-environment-variables)
- [Deploy ke Vercel](#deploy-ke-vercel)
- [Alur Penggunaan](#alur-penggunaan)

----

## Fitur Utama

| Modul                 | Admin | Customer |
| --------------------- | :---: | :------: |
| Autentikasi & Registrasi | Admin & registrasi admin khusus | Registrasi mandiri |
| Dashboard Analitik    | Ya (statistik, grafik) | Tidak |
| Kelola Meja (CRUD)    | Ya (soft/hard delete, restore) | Tidak |
| Lihat Meja Tersedia   | Ya | Ya |
| Buat Reservasi        | Ya (manual) | Ya (untuk diri sendiri) |
| Riwayat Reservasi     | Seluruh data | Hanya milik sendiri |
| Konfirmasi Pembayaran | Ya | Tidak |
| Recycle Bin           | Ya (meja & reservasi) | Tidak |
| Pencarian & Filter    | Ya (nama, tanggal, status) | Tidak |

**Keunggulan Teknis**
- Status meja **dinamis real-time** berdasarkan reservasi aktif.
- Validasi **bentrok jadwal** saat membuat reservasi.
- Soft delete & hard delete untuk menjaga integritas data.
- Session-based authentication dengan pemisahan role.

---

## Aktor & Batasan Akses

| Aktor     | Peran | Batasan |
|-----------|-------|---------|
| **Admin** | Mengelola data master, seluruh reservasi, konfirmasi pembayaran, melihat dashboard dan laporan. | Tidak dapat membuat reservasi atas nama pelanggan lain dengan akun customer (hanya reservasi manual). |
| **Customer** | Melihat meja tersedia, membuat reservasi, melihat riwayat sendiri. | Tidak dapat mengubah data meja, tidak dapat melihat atau mengubah reservasi lain, tidak bisa mengakses panel admin. |

---

## Skema Database

**Kardinalitas Relasi**
- `users` ke `admins` : **one-to-one** (unique constraint on `user_id`).
- `users` ke `customers` : **one-to-one**.
- `customers` ke `reservations` : **one-to-many**.
- `tables` ke `reservations` : **one-to-many**.
- `reservations` ke `payments` : **one-to-one** (unique constraint on `reservation_id`).

---

## DDL SQL – Struktur Tabel Lengkap

Jalankan perintah berikut di SQL Editor PostgreSQL (Neon) untuk membangun database dari awal.

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tables (
    id SERIAL PRIMARY KEY,
    table_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    table_id INTEGER NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
    reservation_date DATE NOT NULL,
    start_time TIME NOT NULL,
    duration INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER UNIQUE NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'Unpaid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reservations_table_date ON reservations(table_id, reservation_date);
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
```

---

## Tech Stack

| Layer        | Teknologi |
| ------------ | --------- |
| **Backend**  | Node.js, Express 5 |
| **Database** | PostgreSQL (Neon) |
| **Frontend** | EJS, Bootstrap 5, Chart.js |
| **Library**  | dotenv, express-session, pg, SweetAlert2, Font Awesome 6 |

---

## Instalasi & Menjalankan Lokal

1. **Clone repository**

   ```bash
   git clone https://github.com/Drazeksja/Sistem-Rental-Playstation-.git
   cd Sistem-Rental-Playstation-
   ```

2. **Install dependensi**

   ```bash
   npm install
   ```

3. **Buat database** menggunakan skrip DDL di atas (jalankan di SQL Editor Neon atau pgAdmin).

4. **Konfigurasi `.env`** (lihat bagian Environment Variables).

5. **Jalankan server**

   ```bash
   node server.js
   ```

   Buka `http://localhost:9001` (atau port yang diatur di `.env`).

---

## Struktur Proyek

```
.
├── controllers/
│   ├── adminController.js
│   ├── authController.js
│   └── customerController.js
├── middleware/
│   └── auth.js
├── routes/
│   ├── adminRoutes.js
│   ├── authRoutes.js
│   └── customerRoutes.js
├── views/
│   ├── auth/
│   │   ├── login.ejs
│   │   ├── register.ejs
│   │   └── register-admin.ejs
│   ├── customer/
│   │   ├── dashboard.ejs
│   │   ├── reservations.ejs
│   │   └── tables.ejs
│   ├── layout/
│   │   ├── header.ejs
│   │   └── footer.ejs
│   ├── reservations/
│   │   ├── index.ejs
│   │   └── trash.ejs
│   ├── tables/
│   │   ├── index.ejs
│   │   └── trash.ejs
│   └── dashboard.ejs
├── db.js
├── server.js
├── package.json
├── .env
├── .gitignore
├── vercel.json
└── README.md
```

---

## Konfigurasi Environment Variables

Buat file `.env` di root proyek (lokal) dan isi dengan:
```env
PORT=9001
DATABASE_URL=postgresql://user:password@ep-...neon.tech/neondb?sslmode=require
SESSION_SECRET=kunci_acak_anda
```

- `DATABASE_URL` – string koneksi PostgreSQL dari Neon.
- `SESSION_SECRET` – kunci acak untuk enkripsi session.

**Jangan commit file `.env`!** Sudah tercantum di `.gitignore`.

---

## Deploy ke Vercel

1. Push proyek ke GitHub.
2. Import proyek di Vercel.
3. Tambahkan environment variables `DATABASE_URL` dan `SESSION_SECRET` di pengaturan Vercel.
4. Deploy – `vercel.json` sudah siap digunakan.

Setiap kali mengubah environment di Vercel, lakukan **Redeploy** agar perubahan diterapkan.

---

## Alur Penggunaan

### Administrator
1. Login di `/auth/login` menggunakan email & password admin.
2. Dashboard menampilkan statistik, grafik tren reservasi, dan konsol terlaris.
3. Kelola meja di `/admin/tables` (CRUD, soft/hard delete).
4. Kelola reservasi di `/admin/reservations` (filter, konfirmasi pembayaran, arsipkan).
5. Recycle Bin dapat diakses dari menu untuk pemulihan data.

### Customer
1. Registrasi di `/auth/register` (nama, telepon, email, password).
2. Login, otomatis masuk ke dashboard customer.
3. Lihat meja tersedia di `/customer/tables` (status real-time).
4. Buat reservasi di `/customer/reservations` – pilih meja, tanggal, jam, durasi (biaya Rp 25.000/jam), sistem menolak bentrok jadwal.
5. Riwayat reservasi hanya menampilkan data pribadi dan status pembayaran.
