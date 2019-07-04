const UrlParser = require('url')
const FS = require('fs')
const FPath = require('path')
const Request = require('superagent')
const Chalk = require('chalk')

class ProxyPool {

    constructor(useRotateProxy=false, proxyFileOrList='./proxy.txt', maxSeqFailCounts = 3, fetchMethod = 'cyclic') {

        this.pool = []
        this.index = 0
        this.maxSeqFailCounts = maxSeqFailCounts
        this.fetchMethod = fetchMethod
        this.blackpool = []
        this.whiteFile = FPath.join(__dirname, './proxy-whitepool.txt')
        this.useRotateProxy = useRotateProxy

        if (!useRotateProxy) {
            let proxyList
            if (typeof(proxyFileOrList) === 'string') {
                proxyList = FS.readFileSync(FPath.join(__dirname, proxyFileOrList)).toString().split("\n")
            } else if (Array.isArray(proxyFileOrList)) {
                proxyList = proxyFileOrList
            } else {
                throw new Error('Wrong proxy file or object !!!')
            }
            this.inject(proxyList)
        }

        if (FS.existsSync(this.whiteFile)) {
            const oldWhiteList = JSON.parse(FS.readFileSync(this.whiteFile))
            this.inject(oldWhiteList)
        }

        setInterval(() => {
            FS.writeFileSync(this.whiteFile, JSON.stringify(
                this.pool.map((p) => [p.protocol+'//', p.hostname, ':'+p.port].join(''))),
                (err) => {if(err) console.log(Chalk.red('dump failed: ', err))})
        }, 60000)

    }

    async fetch() {
        console.log(Chalk.white("pool size: ", this.pool.length))

        if (!this.useRotateProxy || (this.pool.length >= 100 && Math.random() > 0.3) || (this.pool.length >= 400)) {
            if (this.pool.length) {
                let nextProxy
                switch(this.fetchMethod) {
                    case 'random':
                        nextProxy = this.pool[Math.floor(Math.random()*this.pool.length)]
                        break
                    case 'cyclic':
                        nextProxy = this.pool[this.index]
                        this.index = (this.index + 1) % this.pool.length
                        break
                    default:
                        throw new Error('Wrong method !!!')
                }
                return [nextProxy.protocol+'//', nextProxy.hostname, ':'+nextProxy.port].join('')
            } else {
                return null
            }
        } else {
            const response = await Request.get('http://falcon.proxyrotator.com:51337/')
                                        .query({'apiKey': 'apikey',
                                                // 'country': 'US',
                                                // 'connectionType': 'Residential',
                                                'Accept': 'application/json'
                                        })
                                        .timeout({
                                            response: 8000,
                                            deadline: 20000,
                                        })

            if (response) {
                console.log(Chalk.white(response.body.proxy))
                return ['http://', response.body.proxy].join('')
            } else {
                return null
            }
        }
    }

    report(proxy, succeed) {

        let existed = false
        this.pool.some((objProxy, index) => {
            if ([objProxy.protocol+'//', objProxy.hostname, ':'+objProxy.port].join('') === proxy) {
                objProxy.succeedCounts += succeed
                objProxy.failCounts += !succeed
                objProxy.seqFailCounts = succeed ? 0 : objProxy.seqFailCounts + 1

                if (objProxy.seqFailCounts >= this.maxSeqFailCounts) {
                    this.blackpool.push(this.pool.splice(index,1)[0])
                }

                if (succeed) {
                    console.log(Chalk.green("PROXY: ", proxy, " Stats: ",
                                objProxy.succeedCounts, objProxy.failCounts, objProxy.seqFailCounts))
                } else {
                    console.log(Chalk.red("PROXY: ", proxy, " Stats: ",
                                objProxy.succeedCounts, objProxy.failCounts, objProxy.seqFailCounts))
                }

                existed = true
                return true
            } else {
                return false
            }
        })

        if (!existed && succeed) {
            const up = UrlParser.parse(proxy)
            this.pool.push({'hostname': up.hostname, 'port': up.port, 'protocol': up.protocol,
                            'succeedCounts':1, 'failCounts': 0, 'seqFailCounts': 0})
        }
    }

    inject(proxyList) {
        proxyList.map((p) => {
            const up = UrlParser.parse(p, true)
            if (up.hostname) {
                this.pool.push({'hostname': up.hostname, 'port': up.port, 'protocol': up.protocol,
                                'succeedCounts':0, 'failCounts': 0, 'seqFailCounts': 0})
            }
        })
    }

}

module.exports = ProxyPool
