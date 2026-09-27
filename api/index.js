import app from '../src/app.js';

// Vercel Node.js Serverless Functions menerima (req, res) standar,
// dan sebuah Express app persis sesuai signature tersebut,
// sehingga bisa langsung di-export sebagai handler.
export default app;
