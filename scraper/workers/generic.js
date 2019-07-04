const Crypto = require('crypto')
const RandomUserAgent = require('random-useragent')
const Cheerio = require('cheerio')
const Puppeteer = require('puppeteer-core')
const Request = require('superagent')
require('superagent-proxy')(Request)
const UrlParser = require('url')
const ProxyPool = require('../proxy/pool')
const Chalk = require('chalk')
const FPath = require('path')
const FS = require('fs')
const Worker = require(FPath.join(__dirname, 'sites', process.env.SOURCE))


class SelectorError extends Error {
  constructor(message) {
    super(message);
  }
}

class GenericWorker {

    constructor(config) {
        this.config = config || {}
        if (this.config.useProxy) {
            this.proxyPool = new ProxyPool(this.config.useRotateProxy)
        }
    }

    async work(pageConfig, path='') {

        const engine = this.config.engine || pageConfig.engine
        const headless = this.config.headless || pageConfig.headless || false
        const useProxy = this.config.useProxy || false
        const proxy = useProxy ? await this.proxyPool.fetch() : null
        const jobs = pageConfig.jobs

        let newJobs = []
        let failedJobs = []
        let newNodes = {}
        let info = {}

        if (engine === "superagent") {
            const headers = this.config.headers || {...pageConfig.headers, 'User-Agent': RandomUserAgent.getRandom()}
            try {
                // request
                let response
                if (proxy) {
                    response = await Request.get(pageConfig.url)
                                            .set(headers)
                                            .proxy(proxy)
                                            .timeout({
                                                response: 8000,
                                                deadline: 20000,
                                            })
                } else {
                    response = await Request.get(pageConfig.url)
                                            .set(headers)
                }

                // parse
                const $ = await Cheerio.load(response.text)

                // debug purpose
                // if (response.status === 200) {
                //     FS.writeFileSync('tmp.html', response.text,
                //         (err) => {if(err) console.log(Chalk.red('write failed: ', err))})
                // }

                // do jobs on this page
                jobs.map(job => {
                    let [failed, info_, newJobs_, fanoutNodes_] = Worker[job.parser](engine)($, job, pageConfig, path)
                    if (failed) {
                        throw new SelectorError("Selectors not found: " + job.selector + (job.hasOwnProperty('stopselector') ? (', '+job.stopselector) : ''))
                    } else {
                        info = { ...info, ...info_ }
                        newJobs = [ ...newJobs, ...newJobs_ ]
                        newNodes = { ...newNodes, ...fanoutNodes_ }
                    }
                })

            } catch (err) {
                if (err instanceof SelectorError) {
                    console.log(Chalk.yellow(pageConfig.url, ':\n', "Error: Selector"))
                } else {
                    console.log(Chalk.red(pageConfig.url, ':\n', err))
                }
                newJobs = []
                failedJobs = []
                newNodes = {}
                info = {}

                failedJobs.push([pageConfig, path])
            }

        } else if (engine === "puppeteer") {
            if (!this.launch) {
                this.launch = Puppeteer.launch({
                    executablePath: this.config.chromePath || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                    headless: headless,
                    defaultViewport: null,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-features=NetworkService'],
                    ignoreHTTPSErrors: true,
                    dumpio: false
                })
            }

            const browser = await this.launch
            const page = await browser.newPage()

            try {
                await page.setUserAgent(pageConfig.headers['User-Agent'] || RandomUserAgent.getRandom())

                // disable loading heavy things
                if (this.config.lightPuppeteer) {
                    await page.setRequestInterception(true)
                    page.on('request', (req) => {
                        if (['image', 'script', 'font', 'stylesheet', 'xhr'].includes(req.resourceType())) {
                            req.abort()
                        } else {
                            // console.log(Chalk.white(req.resourceType(), req.url()))
                            req.continue()
                        }
                    })
                }

                await page.goto(pageConfig.url, {waitUntil: 'networkidle2', timeout: 20000})

                await page.waitForSelector(jobs.reduce((agg, job) => {
                    return [ ...agg, job.selector,  ...job.stopselector ? [job.stopselector] : [] ]
                }, []).join(', '), {timeout:4000, visible: true})

                await Promise.all(jobs.map(async (job) => {
                    let [failed, info_, newJobs_, fanoutNodes_] = await Worker[job.parser](engine)(page, job, pageConfig, path)
                    if (failed) {
                        throw new SelectorError("Selectors not found: " + job.selector + (job.hasOwnProperty('stopselector') ? (', '+job.stopselector) : ''))
                    } else {
                        info = { ...info, ...info_ }
                        newJobs = [ ...newJobs, ...newJobs_ ]
                        newNodes = { ...newNodes, ...fanoutNodes_ }
                    }
                }))

            } catch (err) {
                if (err instanceof SelectorError) {
                    console.log(Chalk.yellow(pageConfig.url, ':\n', "Error: Selector"))
                } else {
                    console.log(Chalk.red(pageConfig.url, ':\n', err))
                }
                newJobs = []
                failedJobs = []
                newNodes = {}
                info = {}

                failedJobs.push([pageConfig, path])
            }

            // await page.screenshot({path: 'screenshot.png'})
            await page.close()
        }

        if (useProxy && proxy) {
            const succeed = failedJobs.length === 0
            this.proxyPool.report(proxy, succeed)
        }

        return [failedJobs, newJobs, newNodes, info]
    }

}


module.exports = GenericWorker