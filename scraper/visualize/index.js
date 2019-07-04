const express = require('express')
const path = require('path')

const app = express()
const port = 3000

app.use(express.static(path.join(__dirname, 'static')))
app.use(express.static(path.join(__dirname, '..', 'taxonomy')))

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'visualize.html')))

app.listen(port, () => console.log(`Example app listening on port ${port}!`))