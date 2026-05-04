const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { ensureCustomer } = require('../middleware/auth');

router.use(ensureCustomer);

router.get('/dashboard', customerController.getDashboard);
router.get('/tables', customerController.getTables);
router.get('/reservations', customerController.getReservations);
router.post('/reservations', customerController.postReservation);

module.exports = router;
