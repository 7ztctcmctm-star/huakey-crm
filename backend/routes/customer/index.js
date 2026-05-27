const express = require('express');
const router = express.Router();

const detailRoutes = require('./detail');
const contactRoutes = require('./contact');
const poolRoutes = require('./pool');
const assignRoutes = require('./assign');
const importRoutes = require('./import');
const leadsRoutes = require('./leads');
const qualityRoutes = require('./quality');

router.use('/', detailRoutes);
router.use('/contact', contactRoutes);
router.use('/', poolRoutes);
router.use('/', assignRoutes);
router.use('/', importRoutes);
router.use('/leads', leadsRoutes);
router.use('/', qualityRoutes);

module.exports = router;
