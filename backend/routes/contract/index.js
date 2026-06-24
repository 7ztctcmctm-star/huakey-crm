const express = require('express');
const router = express.Router();

// 子模块挂载
router.use('/', require('./crud'));
router.use('/', require('./payment'));
router.use('/', require('./export'));
router.use('/', require('./approval'));

module.exports = router;
