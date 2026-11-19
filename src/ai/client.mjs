// The renderer can hot-reload while Electron still runs an older main/preload.
export async function invokeAI(bridge, action, data) {
  if (typeof bridge?.ai !== 'function') {
    throw new Error('AI 接口尚未加载。请完全退出应用，并在项目终端重新运行 npm start；只刷新页面不会更新主进程。');
  }
  let result;
  try {
    result = await bridge.ai(action, data);
  } catch (error) {
    if (/No handler registered|channel.*closed|context.*released/i.test(error.message)) {
      throw new Error('AI 主进程尚未更新或连接已断开。请完全退出应用，并在项目终端重新运行 npm start，然后重试连接；只刷新页面不会更新主进程。');
    }
    throw error;
  }
  if (!result?.success) throw new Error(result?.error || 'AI 接口未返回有效结果，请重试连接。');
  return result.data;
}
