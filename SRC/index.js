const { createContainer } = require('./container');
const { createApp } = require('./api/app');

const container = createContainer();
const app = createApp(container);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Payout Management System listening on http://localhost:${PORT}`);
});
