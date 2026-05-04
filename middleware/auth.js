/**
 * Middleware Autentikasi & Otorisasi Role-Based
 */

// Cek apakah user sudah login (untuk semua role)
exports.ensureAuthenticated = (req, res, next) => {
    if (req.session.userId) return next();
    res.redirect('/auth/login');
};

// Hanya boleh diakses oleh Admin
exports.ensureAdmin = (req, res, next) => {
    if (req.session.userId && req.session.role === 'admin') return next();
    if (req.session.userId) return res.status(403).send('<script>alert("Akses ditolak. Halaman ini hanya untuk Admin."); window.history.back();</script>');
    res.redirect('/auth/login');
};

// Hanya boleh diakses oleh Customer
exports.ensureCustomer = (req, res, next) => {
    if (req.session.userId && req.session.role === 'customer') return next();
    if (req.session.userId) return res.status(403).send('<script>alert("Akses ditolak. Halaman ini hanya untuk Customer."); window.history.back();</script>');
    res.redirect('/auth/login');
};
