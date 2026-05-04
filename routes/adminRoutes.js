const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { ensureAdmin } = require('../middleware/auth');

router.use(ensureAdmin);

router.get('/dashboard', adminController.getDashboard);

// Tables Routes
router.get('/tables', adminController.getTables);
router.get('/tables/trash', adminController.getTrashedTables);
router.post('/tables', adminController.postTable);
router.post('/tables/update/:id', adminController.updateTable);
router.post('/tables/delete/:id', adminController.softDeleteTable);
router.get('/tables/restore/:id', adminController.restoreTable);
router.post('/tables/permanent-delete/:id', adminController.permanentDeleteTable);

// Reservations Routes  
router.get('/reservations', adminController.getReservations);
router.get('/reservations/trash', adminController.getTrashedReservations);
router.post('/reservations', adminController.postReservation);
router.get('/reservations/confirm/:id', adminController.updatePayment);
router.post('/reservations/delete/:id', adminController.softDeleteReservation);
router.get('/reservations/restore/:id', adminController.restoreReservation);
router.post('/reservations/permanent-delete/:id', adminController.permanentDeleteReservation);

module.exports = router;