const SiteTemplateWorker = require('./template')
const Chalk = require('chalk')


class WayfairWorker extends SiteTemplateWorker{

    constructor() {
        super()
    }

    // wayfair specific methods implementation

    static transformTpl(res, pageConfig) {

        let idx
        res['name'].some((name, i) => {
            if (name.split(/\s+/).slice(-1)[0] === 'Sale') {
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

    static coreWorkPaging(res, pageConfig, path, job) {

        // no new nodes at this step

        // generate new jobs
        const goRecur = res['url'].length > 0 && (job.recursive || false)
        const nextUrls = res['url'].length > 0 ? res['url'] : [ pageConfig.url ]
        const goNext = job.hasOwnProperty('next')
        const newJobs = this.genNewJobsTpl(nextUrls, pageConfig, path, job, goRecur, goNext, true)

        // gather page info
        const info = this.gatherTpl(res, job.expectKeys.gather)

        return [info, newJobs, {}]
    }


    static workPaging(engine) {
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
                let res = {'url':[]}
                const npages = $(nodes[nodes.length-1]).text()
                for (let i=1; i<=npages; i++) {
                    res['url'].push(pageConfig.url + '?curpage=' + i)
                }

                // utilize extracted information
                const [info, newJobs, fanoutNodes] = this.coreWorkPaging(res, pageConfig, path, job)

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

                    let res = {'url':[]}
                    const npages = nodes[nodes.length-1].textContent
                    for (let i=1; i<=npages; i++) {
                        res['url'].push(pageConfig.url + '?curpage=' + i)
                    }

                    return [failed, res]
                }, job)

                if (failed) {
                    return [failed, {}, [], {}]
                }

                // utilize extracted information
                const [info, newJobs, fanoutNodes] = this.coreWorkPaging(res, pageConfig, path, job)

                return [failed, info, newJobs, fanoutNodes]

            }
        } else {
            throw new Error('Wrong enginer !!!')
        }
    }

    static workProductImages(engine) {

        if (engine === 'superagent') {
            return ($, job, pageConfig, path) => {

                // products might have been deleted, then it will be redirected to paging link
                const pagenodes = $('.Pagination-item')
                if (pagenodes.length) {
                    console.log(Chalk.red('Deleted product'))
                    return [false, {}, [], {}]
                }

                const captchanodes = $('h1.Captcha-title')
                if (captchanodes.length) {
                    console.log(Chalk.red('ReCaptchaed :('))
                    return [true, {}, [], {}]
                }

                const nodes = $(job.selector)

                let failed = nodes.length === 0
                if (failed) {
                    return [failed, {}, [], {}]
                }

                let res = {}
                res['src'] = $(nodes).toArray().map(node => $(node).attr('src'))
                const info = this.gatherTpl(res, job.expectKeys.gather)

                return [failed, info, [], {}]
            }
        } else if (engine === 'puppeteer') {
            return async (page, job, pageConfig, path) => {

                let [failed, res] = await page.evaluate((job) => {

                    const nodes = document.querySelectorAll(job.selector)

                    let failed = nodes.length === 0
                    if (failed) {
                        return [failed, {}]
                    }

                    let res = {}
                    res['src'] = [...nodes].map(node => node.getAttribute('src'))

                    return [failed, res]
                }, job)

                if (failed) {
                    return [failed, {}, [], {}]
                }

                const info = this.gatherTpl(res, job.expectKeys.gather)
                return [failed, info, [], {}]

            }
        } else {
            throw new Error('Wrong enginer !!!')
        }
    }


    static workProductShared(engine) {

        if (engine === 'superagent') {
            return ($, job, pageConfig, path) => {

                const pagenodes = $('.Pagination-item')
                if (pagenodes.length) {
                    console.log(Chalk.red('Deleted product'))
                    return [false, {}, [], {}]
                }

                const captchanodes = $('h1.Captcha-title')
                if (captchanodes.length) {
                    console.log(Chalk.red('ReCaptchaed :('))
                    return [true, {}, [], {}]
                }

                const nodes = $(job.selector)

                let failed = nodes.length === 0
                if (failed) {
                    return [failed, {}, [], {}]
                }

                let res = {}
                res['name'] = $(nodes[0]).text()
                const info = this.gatherTpl(res, job.expectKeys.gather)

                return [failed, info, [], {}]
            }
        } else if (engine === 'puppeteer') {
            return async (page, job, pageConfig, path) => {

                let [failed, res] = await page.evaluate((job) => {

                    const nodes = document.querySelectorAll(job.selector)

                    let failed = nodes.length === 0
                    if (failed) {
                        return [failed, {}]
                    }

                    let res = {}
                    res['name'] = nodes[0].textContent

                    return [failed, res]
                }, job)

                if (failed) {
                    return [failed, {}, [], {}]
                }

                const info = this.gatherTpl(res, job.expectKeys.gather)
                return [failed, info, [], {}]

            }
        } else {
            throw new Error('Wrong enginer !!!')
        }
    }

    static workProductNumStars(engine) {

        if (engine === 'superagent') {
            return ($, job, pageConfig, path) => {

                const pagenodes = $('.Pagination-item')
                if (pagenodes.length) {
                    console.log(Chalk.red('Deleted product'))
                    return [false, {}, [], {}]
                }

                const captchanodes = $('h1.Captcha-title')
                if (captchanodes.length) {
                    console.log(Chalk.red('ReCaptchaed :('))
                    return [true, {}, [], {}]
                }

                const nodes = $(job.selector)

                let failed = nodes.length === 0
                if (failed) {
                    return [failed, {}, [], {}]
                }

                let res = {}
                res['width'] = $(nodes[0]).css('width')
                const info = this.gatherTpl(res, job.expectKeys.gather)

                return [failed, info, [], {}]
            }
        } else if (engine === 'puppeteer') {
            return async (page, job, pageConfig, path) => {

                let [failed, res] = await page.evaluate((job) => {

                    const nodes = document.querySelectorAll(job.selector)

                    let failed = nodes.length === 0
                    if (failed) {
                        return [failed, {}]
                    }

                    let res = {}
                    res['width'] = nodes[0].style.width

                    return [failed, res]
                }, job)

                if (failed) {
                    return [failed, {}, [], {}]
                }

                const info = this.gatherTpl(res, job.expectKeys.gather)
                return [failed, info, [], {}]

            }
        } else {
            throw new Error('Wrong engine !!!')
        }
    }



}

module.exports = WayfairWorker