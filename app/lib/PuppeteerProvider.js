const os = require('os')
const cpuNum = os.cpus().length

const initPuppeteerPool = require('./PuppeteerPool')
const puppeteer = require('puppeteer')

const puppeteerArgs = {
  headless: false,
  args: [
    '-–disable-gpu',
    '-–disable-dev-shm-usage',
    '-–disable-setuid-sandbox',
    '-–no-first-run',
    '-–no-sandbox',
    '-–no-zygote',
    '-–single-process'
  ]
}

/**
 * @param {Number} [options.max=10] 最多产生多少个 puppeteer 实例 。如果你设置它，请确保 在引用关闭时调用清理池。 pool.drain().then(()=>pool.clear())
 * @param {Number} [options.min=1] 保证池中最少有多少个实例存活
 * @param {Number} [options.maxUses=2048] 每一个 实例 最大可重用次数，超过后将重启实例。0表示不检验
 * @param {Number} [options.testOnBorrow=true] 在将 实例 提供给用户之前，池应该验证这些实例。
 * @param {Boolean} [options.autostart=false] 是不是需要在 池 初始化时 初始化 实例
 * @param {Number} [options.idleTimeoutMillis=3600000] 如果一个实例 60分钟 都没访问就关掉他
 * @param {Number} [options.evictionRunIntervalMillis=180000] 每 3分钟 检查一次 实例的访问状态
 * @param {Object} [options.puppeteerArgs={}] puppeteer.launch 启动的参数
 * @param {Function} [options.validator=(instance)=>Promise.resolve(true))] 用户自定义校验 参数是 取到的一个实例
 * @param {Object} [options.otherConfig={}] 剩余的其他参数 // For all opts, see opts at https://github.com/coopernurse/node-pool#createpool
 * @return {Object} pool
 */
const poolConfig = {
  max: cpuNum - 1,
  min: 1,
  maxUses: 500,
  idleTimeoutMillis: 30 * 60 * 1000, // 空闲时间超过30min
  evictionRunIntervalMillis: 1 * 60 * 1000, // 每1min检查一次
  maxAliveTimeMillis: 30 * 60 * 1000, // 最大生存时间 30min，强制移除
  puppeteerArgs,
  validator: () => Promise.resolve(true)
}

// 初始化池子
const pool = initPuppeteerPool(poolConfig)

/**
 * 生成图片
 * @param {Object} [param = {}]
 * @param {String} htmlRedisKey kv存储的key
 * @param {String} [body.html] html
 * @param {Number} [body.width] 默认375(iphone5)；图片宽度
 * @param {Number} [body.height] 默认667(iphone5)
 * @param {Number} [body.quality] JPEG图片质量，0-100, 仅限 jpeg
 * @param {Number} [body.ratio] 默认2；倍数，支持 1，2；device scale factor. See {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio | devicePixelRatio} for more info.
 * @param {String} [body.type] type，支持 jpeg，png 两种
 * @param {Number} [body.wait] 默认100；单位 ms；配置时间内无网络访问视为加载完成，数值越大等待渲染时间越长，反之越短；过小的值会导致内容加载未完成。
 * @returns 二进制图片
 */
const snapshot = async (param) => {

  const {
    html,
    width = 375,
    height = 667,
    quality = 80,
    wait = 100,
    type = 'jpeg',
    ratio = 1
  } = param

  /**
   * 创建浏览器标签，截图
   * @param {puppeteer.Browser} browser 浏览器 puppeteer 对象
   * @returns 
   */
  const func = async browser => {
    const page = await browser.newPage()
    // 设置视窗大小
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: ratio
    })
    // 设置需要截图的html内容
    await page.setContent(html)
    await waitForNetworkIdle(page, wait)
    const resource = await page.screenshot({
      fullPage: false,
      omitBackground: true,
      encoding: 'binary',
      type,
      quality
    })
    page.close()

    return resource
  }

  // pool 修改过，不需要手动释放资源
  const res = await pool.use(func)
  return res
}

// 等待HTML 页面资源加载完成
const waitForNetworkIdle = (page, timeout, maxInflightRequests = 0) => {
  page.on('request', onRequestStarted);
  page.on('requestfinished', onRequestFinished);
  page.on('requestfailed', onRequestFinished);

  let inflight = 0;
  let fulfill;
  let promise = new Promise(x => fulfill = x);
  let timeoutId = setTimeout(onTimeoutDone, timeout);
  return promise;

  function onTimeoutDone() {
    page.removeListener('request', onRequestStarted);
    page.removeListener('requestfinished', onRequestFinished);
    page.removeListener('requestfailed', onRequestFinished);
    fulfill();
  }

  function onRequestStarted() {
    ++inflight;
    if (inflight > maxInflightRequests)
      clearTimeout(timeoutId);
  }

  function onRequestFinished() {
    if (inflight === 0)
      return;
    --inflight;
    if (inflight === maxInflightRequests)
      timeoutId = setTimeout(onTimeoutDone, timeout);
  }
}

module.exports = {
  snapshot,
}
