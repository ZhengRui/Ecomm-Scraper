const BullQueue = require('bull')
const Redis = require('ioredis')
const FPath = require('path')
const FS = require('fs')
const Crypto = require('crypto')
const Config = require('../config')
const GenericWorker = require('./generic')
const Sleep = require('sleep')
const Chalk = require('chalk')
const JSONStream = require('JSONStream')


class RedisWorker {
    constructor(config) {
        this.genericWorker = new GenericWorker(config)
        this.nodesFile = FPath.join(__dirname, '/../taxonomy', process.env.SOURCE+'.json')
        this.config = config
    }

    async setStage(stage) {
        let pageConfig
        let client
        let qexists

        switch(stage) {
            case 'taxonomy':
                pageConfig = Config.landing

                this.nodes = BullQueue('nodes', {redis: this.config.redisOpts || {}})
                this.iqueue = BullQueue('iqueue_taxo', {redis: this.config.redisOpts || {}})
                this.oqueue = BullQueue('oqueue_taxo', {redis: this.config.redisOpts || {}})
                await this.oqueue.pause(true)

                client = new Redis(this.config.redisOpts || {})
                qexists = await client.get('bull:iqueue_taxo:id')
                if (!qexists) {
                    let hash = Crypto.createHash('md5').update(pageConfig.url).digest('hex')
                    this.iqueue.add({config: pageConfig, path: hash}, {removeOnComplete: true})
                    this.nodes.add({name:process.env.SOURCE, url: pageConfig.url, path:hash}, {jobId: hash})
                }
                client.quit()

                break

            case 'paging':
                pageConfig = Config.paging

                this.nodes = BullQueue('nodes', {redis: this.config.redisOpts || {}})
                this.iqueue = BullQueue('iqueue_paging', {redis: this.config.redisOpts || {}})
                this.oqueue = BullQueue('oqueue_paging', {redis: this.config.redisOpts || {}})
                await this.oqueue.pause(true)

                client = new Redis(this.config.redisOpts || {})
                qexists = await client.get('bull:iqueue_paging:id')
                if (!qexists) {

                    let nodes = JSON.parse(FS.readFileSync(this.nodesFile))

                    Object.entries(nodes).forEach(([_, node]) => {
                        let hashes = node.path.split(',')
                        hashes.slice(0, -1).forEach(h => {
                            nodes[h].isleaf = false
                        })
                        if (!nodes[hashes.slice(-1)[0]].hasOwnProperty('isleaf')) nodes[hashes.slice(-1)[0]].isleaf = true
                    })

                    Object.entries(nodes).forEach(([hash, node]) => {
                        if (node.isleaf) {
                            this.iqueue.add({config: {...pageConfig, url: node.url}, path: node.path}, {removeOnComplete: true})
                        }
                    })

                }
                client.quit()

                break

            case 'product':
                pageConfig = Config.product

                this.nodes = BullQueue('nodes', {redis: this.config.redisOpts || {}})
                this.iqueue = BullQueue('iqueue_prod', {redis: this.config.redisOpts || {}})
                this.oqueue = BullQueue('oqueue_prod', {redis: this.config.redisOpts || {}})
                await this.oqueue.pause(true)

                client = new Redis(this.config.redisOpts || {})
                qexists = await client.get('bull:iqueue_prod:id')
                if (!qexists) {
                    const readStream = FS.createReadStream(this.nodesFile)
                    const parseStream = JSONStream.parse('*')
                    let i = 0
                    let streamChunks = []

                    const initIqueue = () => new Promise((resolve) => {
                        readStream
                            .pipe(parseStream)
                            .on('data', (node) => {
                                streamChunks.push(this.iqueue.add({config: {...pageConfig, url: node.url}, path: node.path}, {removeOnComplete: true}))

                                i += 1
                                if (!(i % 50000)) {
                                    console.log(Chalk.white('Iqueue initialization progressed to ', i))
                                }

                                if(!(streamChunks.length % 1000)) {
                                    parseStream.pause()
                                    return Promise.all(streamChunks).then(() => {
                                        streamChunks = []
                                        parseStream.resume()
                                    })
                                }

                                return
                            })

                        parseStream.on('end', resolve)
                    })
                    await initIqueue()

                    if (streamChunks.length) {
                        await Promise.all(streamChunks)
                        console.log(Chalk.white('Iqueue initialization progressed to ', i))
                    }

                    console.log(Chalk.blue('Iqueue initialization finished.'))
                }
                client.quit()

                break
            default:
                throw new Error('Wrong stage !!!')
        }
    }

    async work() {

    }

    async scrape(recoverFailedJobs=false) {

        if (recoverFailedJobs) {
            // requeue failed jobs
            let i = 0, j = 0
            let prevFailedJobs = await this.iqueue.getFailed(i, i+999)
            j += prevFailedJobs.length
            while (prevFailedJobs.length) {
                const jc = await this.iqueue.getJobCounts()
                console.log(jc)
                await Promise.all(prevFailedJobs.map((job) => {
                    this.iqueue.add(job.data, {removeOnComplete: true})
                }))
                console.log(Chalk.white("recovered ", j, " previously failed jobs"))
                i += 1000
                prevFailedJobs = await this.iqueue.getFailed(i, i+999)
                j += prevFailedJobs.length
            }

            // clean failed jobs
            j = 0
            this.iqueue.on('cleaned', (jobs, type) => {
                return this.iqueue.getJobCounts().then(jc => {
                    console.log(jc)
                    j += jobs.length
                    console.log(Chalk.white("cleaned ", j, " previously failed jobs"))
                })
            })
            prevFailedJobs = await this.iqueue.getFailed(0, 10)
            while (prevFailedJobs.length) {
                await this.iqueue.clean(0, 'failed', 1000)
                prevFailedJobs = await this.iqueue.getFailed(0, 10)
            }
        }

        this.iqueue.process(this.config.concurrency, async (job) => {
            // Sleep.msleep(200, 1000)

            const pageConfig = job.data.config
            const path = job.data.path

            let [failedJobs, newJobs, newNodes, newInfo] = await this.genericWorker.work(pageConfig, path)

            if (Object.entries(newNodes).length) {

                let promises = []
                Object.keys(newNodes).map((hash) => promises.push(this.nodes.getJobFromId(hash)))
                const existed = (await Promise.all(promises)).map(j => j ? true : false)

                newNodes = Object.keys(newNodes)
                                .filter((_, i) => !existed[i])
                                .reduce((obj, hash) => {
                                    return {
                                        ...obj,
                                        [hash]: newNodes[hash]
                                    }
                                }, {})
                newJobs = newJobs.filter(([_, path]) => newNodes.hasOwnProperty(path.split(',').slice(-1)[0]))
            }

            Object.entries(newNodes).map(([hash, data]) => {
                this.nodes.add(data, {jobId: hash})
            })

            failedJobs.map(([cfg, path]) => {
                this.iqueue.add({config: cfg, path: path}, {removeOnComplete: true})
            })

            newJobs.map(([cfg, path]) => {
                this.oqueue.add({config: cfg, path: path}, {removeOnComplete: true})
            })

            if (! (Object.entries(newInfo).length === 0)) {
                const hash = path.split(',').slice(-1)
                const node = await this.nodes.getJobFromId(hash)
                if (node) {
                    let {info, ...nonInfo} = node.data
                    node.update({ ...nonInfo, info: { ...info, ...newInfo } })
                } else {
                    this.nodes.add({url: pageConfig.url, path: path, info: newInfo}, {jobId: hash})
                }
            }

            console.log(Chalk.white(pageConfig.url, " # of failedJobs/newJobs/newNodes/unfinishedJobs/nxtLevelJobs : ", failedJobs.length, newJobs.length,
                        Object.entries(newNodes).length, await this.iqueue.getWaitingCount(), await this.oqueue.getWaitingCount()))

        })

        this.oqueue.process(1, async (job) => {
            this.iqueue.add(job.data, {removeOnComplete: true})
        })

        const checkDone = setInterval(async () => {
            const icounts = await this.iqueue.getJobCounts()
            const ocounts = await this.oqueue.getJobCounts()
            const idrained = !icounts.waiting && !icounts.active && !icounts.failed
            const odrained = !ocounts.waiting && !ocounts.active && !ocounts.failed

            if (idrained && odrained) {
                clearInterval(checkDone)

                // close queues
                await this.iqueue.close()
                await this.oqueue.close()
                await this.nodes.close()

                // close browser if used puppeteer
                if (this.genericWorker.launch) {
                    const browser = await this.genericWorker.launch
                    browser.close()
                }

                // dump nodes to json
                console.log(Chalk.blue('Dumping nodes to ', this.nodesFile))

                let nodes = {}
                let nodesKeys = []
                const client = new Redis(this.config.redisOpts || {})
                const stream = client.scanStream({
                    match: '*bull:nodes:*',
                    count: 10000
                })
                stream.on('data', (chunk) => {
                    nodesKeys = [...nodesKeys, ...chunk]
                    console.log(Chalk.white('Key fetching progressed to ', nodesKeys.length))
                })

                stream.on('end', async () => {
                    let cnt = 0
                    let nDone = 0

                    let i, chunk = 1000
                    // have to divide into chunks when apply map(async) on a huge array
                    // otherwise it will accumulate all the promises first and then resolve
                    for (i=0; i<nodesKeys.length; i+=chunk) {
                        await Promise.all(nodesKeys.slice(i, i + chunk).map(async (node) => {
                            const hash = node.split(':').slice(-1)[0]
                            // check if is a md5 hash
                            if (!(/[a-fA-F0-9]{32}/).test(hash)) {
                                nDone += 1
                                if (nDone === nodesKeys.length) {
                                    done()
                                }
                                return
                            }

                            // check if is a redis hash
                            const type = await client.type(node)
                            if (type !== 'hash') {
                                nDone += 1
                                if (nDone === nodesKeys.length) {
                                    done()
                                }
                                return
                            }

                            const data = await client.hget(node, 'data')
                            if (data) {
                                nodes[hash] = JSON.parse(data)
                                cnt += 1
                                if (!(cnt % 10000)) {
                                    console.log(Chalk.white('Value fetching progressed to ', cnt))
                                }
                            }
                            nDone += 1
                            if (nDone === nodesKeys.length) {
                                done()
                            }
                        }))
                    }
                    client.quit()
                })

                const done = () => {
                    const oStream = FS.createWriteStream(this.nodesFile, {highWaterMark: Math.pow(2,16)})

                    oStream.write('{\n')
                    const ntot = Object.keys(nodes).length
                    console.log(Chalk.blue('Total # of nodes to dump: ', ntot))
                    Object.entries(nodes).forEach(([hash, data], i) => {
                        oStream.write(JSON.stringify({[hash]:data}).slice(1,-1) + (i === ntot - 1 ? '\n' : ',\n'))
                        if (!(i % 10000)) {
                            console.log(Chalk.white('Dumping progressed to ', i))
                        }
                    })
                    oStream.write('}\n')

                    oStream.end()
                    oStream.on('finish', () => {
                        console.log(Chalk.blue('Finished'))
                    })

                }
            } else if (idrained) {
                await this.iqueue.pause(true, false)
                await this.oqueue.resume(true)
                console.log(Chalk.blue('iqueue is empty'))
            } else if (odrained) {
                await this.oqueue.pause(true, false)
                await this.iqueue.resume(true)
                console.log(Chalk.blue('oqueue is empty'))
            }

        }, 10000)

    }

}

module.exports = RedisWorker
