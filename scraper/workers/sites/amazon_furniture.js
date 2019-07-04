const SiteTemplateWorker = require('./template')
const UrlParser = require('url')
const Chalk = require('chalk')


class AmazonFurnitureWorker extends SiteTemplateWorker{

    constructor() {
        super()
    }

    // wayfair specific methods implementation

    static transformTpl(res, pageConfig) {
        res['url'] = res['url'].map((url) => {
            const up = UrlParser.parse(pageConfig.url, true)
            return [up.protocol+'//', up.host, url].join('')
        })

        let idx
        res['name'].some((name, i) => {
            if (name === 'Furniture') {
                idx = i
                console.log(Chalk.yellow('IGNORED --------> ', name, pageConfig.url))
                return true
            } else {
                return false
            }
        })

        if (idx !== undefined) {
            res['name'].splice(idx, 1)
            res['url'].splice(idx, 1)
        }

        return res
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
                res['name'] = $(nodes).toArray().map(node => $(node.children[1]).attr('alt'))
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
                    res['name'] = [...nodes].map(node => node.children[0].alt)
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

module.exports = AmazonFurnitureWorker