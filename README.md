### Scraping procedure

+ Landing: scrape taxonomy.

+ Paging: scrape product links.

+ Product: scrape each product information of interests.

+ Downloading: download images.

So far, we have the taxonomy tree, and each leaf node's products with images and interested information.

### Configs

+ General configs are in `scraper/index.js` file, these include:
  - Request setting: `engine` can be `superagent` or `puppeteer`. `Puppeteer` specific settings are `chromePath`, `headless` and `lightPuppeteer`. `lightPuppeteer` should be set to `true` if we don't want to load heavy and irrelevant resources like images, js scripts etc. `headers` can also be specified.

  - Proxy setting: set `useProxy` as `true` to use proxy, and set `useRotateProxy` as `true` to use rotating proxy. When using rotating proxy, we maintain a pool to cache good proxies. Start from an empty pool, each request will use a new proxy fetched from a paid proxy service (e.g. `proxyrotator.com`), sucessful proxies are pushed into the pool. Once pool size is above certain number *k*, the proxy will be sampled with probability *r* from the pool, otherwise fetch a new proxy from the paid service. If a proxy in the pool failed continuously for *n* times, it is removed from the pool. *k, r, n* can be set in `scraper/proxy/pool.js`.

  - Redis setting: specify `host`, `port` and `password` for connection to redis server. specify `concurrency` for number of workers to process `Jobs` in the redis queue.

+ Site specific selector and scrapying configs are in `scraper/config` folder, it has the following format:

### Concepts
+ Job & Node

+ Worker

+ Parser


### Scale up
The scraper can run within the docker:
```bash
cd scraper
docker-compose up -d
docker-compose scale worker=10
```

### Visualization


### Node manipulation


