module.exports = {
    landing: {
        url: "https://www.wayfair.com",
        engine: "superagent",
        headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0'
        },
        jobs: [
            {
                selector: "#main-header > div.ExposedDepartments > ul > li:nth-child(n+2) > a",
                parser: "workTpl",
                expectKeys: {
                    gather: {

                    },
                    fanout: {
                        name: "name",
                        url: "url"
                    }
                },
                next: {
                    jobs: [
                        {
                            selector: "#bd > div.Grid-item--row.u-mb-6 > section:nth-child(1) > div > div > div > a",
                            parser: "workTpl",
                            expectKeys: {
                                gather: {

                                },
                                fanout: {
                                    name: "name",
                                    url: "url"
                                }
                            },
                            recursive: true,
                            stopselector: ".ResultsText",
                        },
                    ]
                }
            },
        ]
    },

    paging: {
        engine: "puppeteer",
        headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0'
        },
        jobs: [
            {
                selector: ".Pagination-item:not(.Pagination-icon--next):not(.Pagination-icon--prev)",
                parser: "workPaging",
                expectKeys: {
                    gather: {

                    },
                    fanout: {
                        npages: "npages",
                    }
                },
                next: {
                    jobs: [
                        {
                            selector: "#sbprodgrid > div > div > div > div > a:not(.NativeMedia-link)",
                            parser: "workTpl",
                            expectKeys: {
                                gather: {

                                },
                                fanout: {
                                    name: "name",
                                    url: "url"
                                }
                            },
                        }
                    ]
                }
            }
        ]
    },

    product: {
        enginer: "puppeteer",
        headers: {
            'Accept': 'text/html',
            'User-Agent': 'Mozilla/5.0'
        },
        jobs: [
            {
                selector: "button.ProductDetailImageThumbnail img.ImageComponent-image",
                parser: "workProductImages",
                expectKeys: {
                    gather: {
                        src: "images"
                    },
                    fanout: {

                    }
                }
            },
            {
                selector: "a.ProductDetailInfoBlock-header-manuLink",
                parser: "workProductShared",
                expectKeys: {
                    gather: {
                        name: "by"
                    },
                    fanout: {

                    }
                }
            },
            {
                selector: "header div.pl-ReviewStars-rating",
                parser: "workProductNumStars",
                expectKeys: {
                    gather: {
                        width: "nstars"
                    },
                    fanout: {

                    }
                }
            },
            {
                selector: "header p.pl-ReviewStars-reviews",
                parser: "workProductShared",
                expectKeys: {
                    gather: {
                        name: "nreviews"
                    },
                    fanout: {

                    }
                }
            },
            {
                selector: "header h1.pl-PageTitle-header",
                parser: "workProductShared",
                expectKeys: {
                    gather: {
                        name: "title"
                    },
                    fanout: {

                    }
                }
            },
            {
                selector: "div.StandardPriceBlock > div.BasePriceBlock",
                parser: "workProductShared",
                expectKeys: {
                    gather: {
                        name: "price"
                    },
                    fanout: {

                    }
                }
            }
        ]
    }
}
