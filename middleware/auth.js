module.exports = (req, res, next) => {
  if (req.session.admin) return next();
  res.status(401).json({ error: 'Please sign in to continue.' });
};
