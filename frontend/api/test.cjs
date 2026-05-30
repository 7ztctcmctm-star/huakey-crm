module.exports = (req, res) => {
  res.json({ code: 200, message: 'Hello from Vercel Function!', time: new Date().toISOString() });
};
