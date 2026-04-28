const express = require('express');
const app = express();
app.get('/api/status', (req, res) => res.json({ success: true, message: 'Test Server OK' }));
app.listen(3001, () => console.log('Test Server running on 3001'));
