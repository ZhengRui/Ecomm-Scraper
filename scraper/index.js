const RandomUserAgent = require('random-useragent')
const RedisWorker = require('./workers/redis')

const forceConfig = {
    engine: 'superagent',
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        // 'Cookie': '',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': RandomUserAgent.getRandom(),
    },
    chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // chromePath: '/usr/bin/google-chrome-stable',

    useProxy: true,
    useRotateProxy: true,
    lightPuppeteer: false,
    headless: false,
    concurrency: 100,

    redisOpts: {
        host: 'host',
        port: 6379,
        password: 'password'
    }
}


const worker = new RedisWorker(forceConfig)

const task = async () => {
    await worker.setStage('product')
    await worker.scrape(false)
}

task()
