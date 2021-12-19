const crypto = require('crypto');
const PuppeteerProvider = require('../lib/PuppeteerProvider')

const Service = require('egg').Service;

const oneDay = 24 * 60 * 60;

class SnapshotService extends Service {

  constructor(ctx) {
    super(ctx)
    this.cache = new WeakMap()
  }

  /**
   * html渲染图片接口
   *
   * @param {Egg.Context} ctx 上下文
   * @param {Object} [body] body
   * @param {String} [body.html] html
   * @param {Number} [body.width] 默认375(iphone5)；图片宽度
   * @param {Number} [body.height] 默认667(iphone5)
   * @param {Number} [body.quality] JPEG图片质量，0-100, 仅限 jpeg
   * @param {Number} [body.ratio] 默认2；倍数，支持 1，2；device scale factor. See {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio | devicePixelRatio} for more info.
   * @param {String} [body.type] type，支持 jpeg，png 两种
   * @param {Number} [body.wait] 默认100；单位 ms；配置时间内无网络访问视为加载完成，数值越大等待渲染时间越长，反之越短；过小的值会导致内容加载未完成。
   * @returns {Object} [result] 返回报文；
   */
  async handleSnapshot(body) {
    const { ctx } = this;
    const { html } = body
    // 根据 html 做 sha256 的哈希作为 Redis Key
    const htmlRedisKey = crypto.createHash('sha256').update(html).digest('hex');

    try {
      // 首先看海报是否有绘制过的
      let result = await this.findImageFromCache(htmlRedisKey);

      // 命中缓存失败
      if (!result) {
        result = await this.generateSnapshot(htmlRedisKey, body);
      }

      return result;
    } catch (error) {
      ctx.logger.error('绘制海报失败', error)
      throw error
    }
  }

  /**
   * 判断kv中是否有缓存
   *
   * @param {String} htmlRedisKey kv存储的key
   */
  async findImageFromCache(htmlRedisKey) {
    return this.cache[htmlRedisKey]
  }

  /**
   * 设置缓存
   *
   * @param {String} htmlRedisKey kv存储的key
   */
  async setImageToCache(htmlRedisKey, res) {
    // await ctx.kvdsClient.setex(htmlRedisKey, oneDay, res);
    this.cache[htmlRedisKey] = res
  }

  /**
   * 生成截图
   *
   * @param {String} htmlRedisKey kv存储的key
   * @param {String} [body.html] html
   * @param {Number} [body.width] 默认375(iphone5)；图片宽度
   * @param {Number} [body.height] 默认667(iphone5)
   * @param {Number} [body.quality] JPEG图片质量，0-100, 仅限 jpeg
   * @param {Number} [body.ratio] 默认2；倍数，支持 1，2；device scale factor. See {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio | devicePixelRatio} for more info.
   * @param {String} [body.type] type，支持 jpeg，png 两种
   * @param {Number} [body.wait] 默认100；单位 ms；配置时间内无网络访问视为加载完成，数值越大等待渲染时间越长，反之越短；过小的值会导致内容加载未完成。
   * @returns {Object} [result] 返回报文；
   */
  async generateSnapshot(htmlRedisKey, body) {
    const { ctx } = this;
    const {
      html,
      width = 375,
      height = 667,
      quality = 80,
      ratio = 2,
      type = 'jpeg',
    } = body;

    let imgBuffer;
    try {
      imgBuffer = await PuppeteerProvider.snapshot({ html, width, height, quality, ratio, type });
    } catch (err) {
      ctx.logger.error('生成海报失败', PuppeteerProvider, 'asdfasdf', err,)
      throw err
    }

    
    let res

    try {
      const imgUrl = await this.uploadImage(imgBuffer);
      res = {
        img: imgUrl || '',
        type: 'CDN' //IMAGE_TYPE_MAP.CDN,
      }

      // 将海报图片存在 Redis 里
      await this.setImageToCache(htmlRedisKey, res);
    } catch (err) {
      ctx.logger.error('上传海报失败', err)
      throw err
    }

    return res;
  }

  /**
   * 上传图片到CDN
   *
   * @param {Buffer} imgBuffer 图片buffer
   */
  async uploadImage(imgBuffer) {
    const filehash = crypto.createHash('sha256').update(imgBuffer).digest('hex');
    // upload image to cdn and return cdn url
    console.log('buffer', imgBuffer)
    return 'data:image/png;base64,' + imgBuffer
  }
}

module.exports = SnapshotService;
