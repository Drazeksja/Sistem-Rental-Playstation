const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ override: true });
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set folder static jika nanti ingin memisahkan file CSS/JS
app.use(express.static(path.join(__dirname, 'public'))); 

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Inject session data ke semua views (untuk navbar dinamis)
app.use((req, res, next) => {
    res.locals.currentUser = {
        userId: req.session.userId || null,
        username: req.session.username || null,
        email: req.session.email || null,
        role: req.session.role || null
    };
    next();
});

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const customerRoutes = require('./routes/customerRoutes');

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/customer', customerRoutes);

app.get('/', (req, res) => res.redirect('/auth/login'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server jalan di http://localhost:${PORT}`));