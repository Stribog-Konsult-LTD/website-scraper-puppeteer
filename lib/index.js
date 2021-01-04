const puppeteer = require('puppeteer');
const logger = require('./logger.js');

class PuppeteerPlugin {
    constructor({
                    launchOptions = {},
                    scrollToBottom = null,
                    blockNavigation = false,
                    token = true,//dobrys
                    filterEmpty = ['<title>404 Not Found</title>', '<title>Страница не найдена</title>'],//dobrys
                    stayOnDomain = true,//dobrys
                    domain = '',//dobrys,
                    socketIO = null//dobrys
                } = {}) {
        this.launchOptions = launchOptions;
        this.scrollToBottom = scrollToBottom;
        this.blockNavigation = blockNavigation;
        this.filterEmpty = filterEmpty;//dobrys
        this.token = token;//dobrys
        this.socketIO = socketIO;//dobrys
        this.domain = domain;//dobrys
        this.stayOnDomain = stayOnDomain;//dobrys
        this.browser = null;
        this.headers = {};

        logger.info('init plugin', {launchOptions, scrollToBottom, blockNavigation});

        this.emit = function (label, data) {
            if (this.socketIO !== null) {
                this.socketIO.emit(token, {'progress': label, data})

            } else {
                console.error('No Socket.IO attached');
            }
        }
    }

    apply(registerAction) {
        registerAction('beforeStart', async ({options}) => {
            this.browser = await puppeteer.launch(this.launchOptions);
        });

        registerAction('beforeRequest', async ({resource, requestOptions}) => {
            //console.log("beforeRequest");
            if (hasValues(requestOptions.headers)) {
                this.headers = Object.assign({}, requestOptions.headers);
            }
            //console.log("preparing :",resource.url);

            this.emit('preparing', resource.url);
            return {requestOptions};
        });

        registerAction('afterResponse', async ({response}) => {
            //console.log("afterResponse");
            //dobrys
            if (this.stayOnDomain) {
                let url = response.request.href;
                //console.log("check url:",url, url.indexOf(this.domain));
                if (url.indexOf(this.domain) == -1) {
                    //console.log("stayOnDomain::Blocked urln:", url);
                    console.log("stayOnDomain::Blocked url:%s  because leaving domain %s", url, this.domain);
                    await blockURL(page, url);
                }

            }
            const contentType = response.headers['content-type'];
            //console.log("afterResponse::contentType:", contentType);
            const isHtml = contentType && contentType.split(';')[0] === 'text/html';
            if (isHtml) {
                const url = response.request.href;
                const dec_url = decodeURIComponent(url);
                //console.log(response.request);
                //console.log(response.body);

                const page = await this.browser.newPage();
                //await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')


                if (hasValues(this.headers)) {
                    logger.info('set headers to puppeteer page', this.headers);
                    await page.setExtraHTTPHeaders(this.headers);
                }



                if (this.blockNavigation) {
                    console.log("blockNavigation::Blocked url:", url);
                    await blockNavigation(page, url);
                }

                await page.goto(url);

                if (this.scrollToBottom) {
                    await scrollToBottom(page, this.scrollToBottom.timeout, this.scrollToBottom.viewportN);
                }

                const content = await page.content();
                //console.log("content:",content);
                //console.log("Pages::Body:", response.body);
                //this.emit('scraping',{'url':url,'body':content});

                if (1) {
                    for (let i in this.filterEmpty) {
                        let check = this.filterEmpty[i]
                        if (content.indexOf(check) > 0) {
                            console.log("block empty Pages::Blocked url:", url);
                            await blockURL(page, url);
                        }
                    }
                }

                this.emit('debug', {'url': dec_url, 'response': response});
                this.emit('scraping', {'url': dec_url, 'statusCode': response.statusCode});
                await page.close();
                // convert utf-8 -> binary string because website-scraper needs binary
                return Buffer.from(content).toString('binary');
            } else {
                this.emit('scraping', {'url': response.request.href, 'statusCode': response.statusCode});
                return response.body;
            }
        });

        registerAction('afterFinish', () => this.browser && this.browser.close());
    }
}

function hasValues(obj) {
    return obj && Object.keys(obj).length > 0;
}


async function scrollToBottom(page, timeout, viewportN) {
    logger.info(`scroll puppeteer page to bottom ${viewportN} times with timeout = ${timeout}`);

    await page.evaluate(async (timeout, viewportN) => {
        await new Promise((resolve, reject) => {
            let totalHeight = 0, distance = 200, duration = 0, maxHeight = window.innerHeight * viewportN;
            const timer = setInterval(() => {
                duration += 200;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= document.body.scrollHeight || duration >= timeout || totalHeight >= maxHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        });
    }, timeout, viewportN);
}

async function blockURL(page, url) {
    logger.info(`STOP navigation for puppeteer page from url ${url}`);
    req.abort('aborted');
}

async function blockNavigation(page, url) {
    logger.info(`block navigation for puppeteer page from url ${url}`);

    page.on('request', req => {
        if (req.isNavigationRequest() && req.frame() === page.mainFrame() && req.url() !== url) {
            req.abort('aborted');
        } else {
            req.continue();
        }
    });
    await page.setRequestInterception(true);
}

module.exports = PuppeteerPlugin;
