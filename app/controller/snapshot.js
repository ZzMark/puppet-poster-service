
const Controller = require('egg').Controller;

class SnapshotController extends Controller {

  /**
   * html渲染图片接口
   *
   * @param {Egg.Context} ctx 上下文
   * @param {String} [body.html] 必填；待生成的html
   * @param {Number} [body.width] 默认375(iphone5)；图片宽度
   * @param {Number} [body.height] 默认667(iphone5)
   * @param {Number} [body.quality] JPEG图片质量，0-100, 仅限 jpeg
   * @param {Number} [body.ratio] 默认2；倍数，支持 1，2；device scale factor. See {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio | devicePixelRatio} for more info.
   * @param {String} [body.type] type，支持 jpeg，png 两种
   * @param {Number} [body.wait] 默认100；单位 ms；配置时间内无网络访问视为加载完成，数值越大等待渲染时间越长，反之越短；过小的值会导致内容加载未完成。
   * @returns {Object} [result] 返回报文；
   */
  async postSnapshotJson() {
    const { ctx } = this

    const body = ctx.request.body;

    const result = await ctx.service.snapshot.handleSnapshot(body);

    ctx.body = result;
  }

}

module.exports = SnapshotController;
