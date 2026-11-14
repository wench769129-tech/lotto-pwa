// App 內的確認／提示視窗，取代瀏覽器原生 confirm()/alert()（原生視窗會顯示網址「xxx.github.io 顯示」）。
// 用 <dialog>：自帶半透明背景、焦點鎖定、按返回鍵／Esc 等同取消。

let dlg;

function ensure() {
  if (dlg) return dlg;
  dlg = document.createElement('dialog');
  dlg.className = 'app-dialog';
  dlg.innerHTML = `<form method="dialog">
    <h3 class="dlg-title"></h3>
    <div class="dlg-body"></div>
    <div class="dlg-actions"></div>
  </form>`;
  // 點背景（dialog 本身，不是內層 form）也當作取消
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
  document.body.append(dlg);
  return dlg;
}

/**
 * @param {object} o
 * @param {string} o.message    主文字（純文字）
 * @param {string} [o.html]     附加內容（HTML，例如彩券號碼球）
 * @param {string} [o.ok]       確定按鈕文字
 * @param {string|null} [o.cancel] 取消按鈕文字；null 表示只有一顆按鈕（提示用）
 * @param {boolean} [o.danger]  確定按鈕用紅色
 * @returns {Promise<boolean>} 按確定為 true，其餘為 false
 */
export function showDialog({ message, html = '', ok = '確定', cancel = '取消', danger = false }) {
  const d = ensure();
  if (d.open) d.close('cancel');
  d.querySelector('.dlg-title').textContent = '大樂透分析';
  const body = d.querySelector('.dlg-body');
  body.textContent = message;
  if (html) body.insertAdjacentHTML('beforeend', `<div class="dlg-extra">${html}</div>`);
  const btn = (v, label, cls) => `<button value="${v}" class="${cls}">${label}</button>`;
  d.querySelector('.dlg-actions').innerHTML =
    (cancel != null ? btn('cancel', cancel, 'dlg-cancel') : '') + btn('ok', ok, danger ? 'dlg-ok danger' : 'dlg-ok');
  d.returnValue = '';
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
    // 預設焦點放在取消（避免誤按刪除）；只有一顆按鈕時放在確定
    d.querySelector(cancel != null ? '.dlg-cancel' : '.dlg-ok').focus();
  });
}

export const appConfirm = (message, opts = {}) => showDialog({ message, ...opts });
export const appAlert = (message, opts = {}) => showDialog({ message, cancel: null, ...opts });
