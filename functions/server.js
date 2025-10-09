const express = require('express');
const axios = require('axios');
const serverless = require('serverless-http');

const app = express();
app.use(express.json());

// ... (mesmo código do index.js acima)

// Export para Netlify Functions
module.exports.handler = serverless(app);