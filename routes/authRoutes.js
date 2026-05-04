const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Login
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);

// Register Customer (Publik)
router.get('/register', authController.getRegister);
router.post('/register', authController.postRegister);

// Register Admin (Untuk seeding admin pertama)
router.get('/register-admin', authController.getRegisterAdmin);
router.post('/register-admin', authController.postRegisterAdmin);

// Logout
router.get('/logout', authController.logout);

module.exports = router;
