const express = require('express');
const router = express.Router();

// 子模块挂载
router.use('/', require('./custom'));
router.use('/', require('./dashboard'));
router.use('/', require('./analytics'));

module.exports = router;
