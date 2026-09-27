import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log('');
  console.log('🍓  Berry CMS is running!');
  console.log(`📊  Dashboard : http://localhost:${PORT}/`);
  console.log(`🔌  GraphQL   : http://localhost:${PORT}/graphql`);
  console.log(`❤️   Health    : http://localhost:${PORT}/health`);
  console.log('');
});
