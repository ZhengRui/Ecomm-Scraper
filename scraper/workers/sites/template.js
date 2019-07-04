const Crypto = require('crypto')

class SiteTemplateWorker {

    static fanoutTpl(res, fanoutMapper) {
        let newNodes = {}

        let nodeData = {}
        Object.entries(fanoutMapper).map(([resKey, nodeKey]) => {
            nodeData[nodeKey] = res[resKey]
        })

        const nodeKeys = Object.keys(nodeData)
        const nodeVals = Object.values(nodeData)
        const nodeHashes = nodeData['url'].map(url => Crypto.createHash('md5').update(url).digest('hex'))

        nodeVals[0].map((_, i) => {
            newNodes[nodeHashes[i]] = nodeVals.map(val => val[i])
                                            .reduce((agg, val, i) => ({...agg, [nodeKeys[i]]: val}), {})
        })

        return newNodes
    }

    static genNewJobsTpl(nextUrls, pageConfig, path, job, goRecur, goNext, staySameLevel=false) {
        let newJobs = []
        nextUrls.map((url) => {
            let nextPageConfig
            if (goRecur) {
                nextPageConfig = { ...pageConfig }
                nextPageConfig.jobs = [job]
            } else if (goNext) {
                nextPageConfig = { ...job.next }
                nextPageConfig.engine = nextPageConfig.engine || pageConfig.engine
                nextPageConfig.headers = nextPageConfig.headers || pageConfig.headers
            }

            if (nextPageConfig) {
                nextPageConfig.url = url
                const hash = Crypto.createHash('md5').update(url).digest('hex')
                newJobs.push([nextPageConfig, staySameLevel ? path : [path, hash].join()])
            }

        })
        return newJobs
    }

    static gatherTpl(res, gatherMapper) {
        let info = {}

        Object.entries(gatherMapper).map(([resKey, infoKey]) => {
            info[infoKey] = res[resKey]
        })

        return info
    }

    static transformTpl(res, pageConfig) {
        return res
    }

    static coreWorkTpl(res, pageConfig, path, job) {

        // generate new nodes
        let fanoutNodes = this.fanoutTpl(res, job.expectKeys.fanout)
        Object.entries(fanoutNodes).map(([hash, val]) => {
            val['path'] = [path, hash].join()
        })

        // generate new jobs
        const goRecur = res['url'].length > 0 && (job.recursive || false)
        const nextUrls = res['url'].length > 0 ? res['url'] : [ pageConfig.url ]
        const goNext = job.hasOwnProperty('next')
        const newJobs = this.genNewJobsTpl(nextUrls, pageConfig, path, job, goRecur, goNext, false)

        // gather page info
        const info = this.gatherTpl(res, job.expectKeys.gather)

        return [info, newJobs, fanoutNodes]
    }


    static workTpl(engine) {
        if (engine === 'superagent') {
            return ($, job, pageConfig, path) => {

                // check succeed
                const nodes = $(job.selector)

                let failed = nodes.length === 0
                if (failed && job.stopselector) {
                    const stopnodes = $(job.stopselector)
                    failed = stopnodes.length === 0
                }

                if (failed) {
                    return [failed, {}, [], {}]
                }

                // extract information
                let res = {}
                res['name'] = $(nodes).toArray().map(node => $(node).text())
                res['url'] = $(nodes).toArray().map(node => $(node).attr('href'))

                // transform and filter information
                res = this.transformTpl(res, pageConfig)

                // utilize extracted information
                const [info, newJobs, fanoutNodes] = this.coreWorkTpl(res, pageConfig, path, job)

                return [failed, info, newJobs, fanoutNodes]

            }
        } else if (engine === 'puppeteer') {
            return async (page, job, pageConfig, path) => {
                let [failed, res] = await page.evaluate((job) => {

                    const nodes = document.querySelectorAll(job.selector)

                    let failed = nodes.length === 0
                    if (failed && job.stopselector) {
                        const stopnodes = document.querySelectorAll(job.stopselector)
                        failed = stopnodes.length === 0
                    }

                    if (failed) {
                        return [failed, {}]
                    }

                    let res = {}
                    res['name'] = [...nodes].map(node => node.textContent)
                    res['url'] = [...nodes].map(node => node.getAttribute('href'))

                    return [failed, res]
                }, job)

                if (failed) {
                    return [failed, {}, [], {}]
                }

                // transform and filter information
                res = this.transformTpl(res, pageConfig)

                // utilize extracted information
                const [info, newJobs, fanoutNodes] = this.coreWorkTpl(res, pageConfig, path, job)

                return [failed, info, newJobs, fanoutNodes]

            }
        } else {
            throw new Error('Wrong enginer !!!')
        }
    }


}

module.exports = SiteTemplateWorker