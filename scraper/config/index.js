const src = process.env.SOURCE

const wayfair = require('./wayfair')
const amazon_furniture = require('./amazon_furniture')

const config = {
    wayfair,
    amazon_furniture,

}


module.exports = config[src]