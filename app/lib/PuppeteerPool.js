const puppeteer = require('puppeteer')
const genericPool = require('generic-pool')

/**
 * 初始化一个 Puppeteer 池
 * @param {Object} [options={}] 创建池的配置配置
 * @param {Number} [options.max=10] 最多产生多少个 puppeteer 实例 。如果你设置它，请确保 在引用关闭时调用清理池。 pool.drain().then(()=>pool.clear())
 * @param {Number} [options.min=2] 保证池中最少有多少个实例存活
 * @param {Number} [options.maxUses=2048] 每一个 实例 最大可重用次数，超过后将重启实例。0表示不检验
 * @param {Number} [options.testOnBorrow=true] 在将 实例 提供给用户之前，池应该验证这些实例。
 * @param {Boolean} [options.autostart=false] 是不是需要在 池 初始化时 初始化 实例
 * @param {Number} [options.idleTimeoutMillis=3600000] 默认 1h；实例 允许空闲时间
 * @param {Number} [options.evictionRunIntervalMillis=180000] 默认 3min；实例空闲状态检查
 * @param {Number} [options.maxAliveTimeMillis=1800000] 默认30min, 最大生存时间，超过视为应当销毁。仅在使用前检查
 * @param {Object} [options.puppeteerArgs={}] puppeteer.launch 启动的参数
 * @param {Function} [options.validator=(instance)=>Promise.resolve(true))] 用户自定义校验 参数是 取到的一个实例
 * @param {Object} [options.otherConfig={}] 剩余的其他参数 // For all opts, see opts at https://github.com/coopernurse/node-pool#createpool
 * @return {Object} pool
 */
const initPuppeteerPool = (options = {}) => {
  const {
    max = 10,
    min = 2,
    maxUses = 2048,
    testOnBorrow = true,
    autostart = false,
    idleTimeoutMillis = 3600 * 1000,
    evictionRunIntervalMillis = 180 * 1000,
    maxAliveTimeMillis = 1800 * 1000,
    puppeteerArgs = {},
    validator = () => Promise.resolve(true),
    ...otherConfig
  } = options

  const factory = {
    create: async () => {
      console.log('创建 puppeteer 实例. args: ', puppeteerArgs);
      const browser = await puppeteer.launch(puppeteerArgs)
      // 创建一个 puppeteer 实例 ，并且初始化使用次数为 0
      browser.useCount = 0
      browser.createTimestamp = new Date().getTime()
      return browser
    },
    destroy: browser => {
      console.log('实例销毁');
      browser.close()
    },
    validate: browser => {
      // 执行一次自定义校验，并且校验校验 实例已使用次数。 当 返回 reject 时 表示实例不可用
      return validator(browser)
        .then(valid => Promise.resolve(
          // 上层传入的校验
          valid &&
          // 最大次数
          (maxUses <= 0 || browser.useCount < maxUses) &&
          // 最大存活时间
          (maxAliveTimeMillis <= 0 || (new Date().getTime() - browser.createTimestamp) < maxAliveTimeMillis))
        )
    }
  }
  const config = {
    max,
    min,
    testOnBorrow,
    autostart,
    idleTimeoutMillis,
    evictionRunIntervalMillis,
    ...otherConfig
  }
  const pool = genericPool.createPool(factory, config)
  const genericAcquire = pool.acquire.bind(pool)
  // 重写了原有池的消费实例的方法。添加一个实例使用次数的增加
  pool.acquire = () =>
    genericAcquire().then(instance => {
      instance.useCount += 1
      return instance
    })
  pool.use = fn => {
    let resource
    return pool
      .acquire()
      .then(r => {
        resource = r
        return resource
      })
      .then(fn)
      .then(
        result => {
          // 不管业务方使用实例成功与后都表示一下实例消费完成
          pool.release(resource)
          return result
        },
        err => {
          pool.release(resource)
          throw err
        }
      )
  }
  return pool
}

module.exports = initPuppeteerPool
