// ============================================================================
// 会话轨迹条插件 (Scroll Track) — 静态常驻客户端插件
// 常驻版（升级自动态插件 v63，源码：../../client.js）
// 格式照 dsh-task-console：window.__ModuleLoader__.load + exports.{apply,inject}
// 与动态版的差异：
//   1. React 由全局改为 require("react")（静态模块无全局注入）
//   2. styles.insert(...) 改手动 <style> 标签注入（task-console 同款）
//   3. ctx.timeout/ctx.interval 改原生 setTimeout/setInterval（静态环境浏览器 API 可用）
// v63 修复：悬浮窗内条目（浮窗行）点击“有时没反应”——
//   根因：onPointerDown 直接读 e.target.dataset，而浮窗行内的
//   文本/圆点/序号都是 <span>，没有 data 属性，点击落在 span 上时
//   事件被漏判，落入“空白区域”分支直接 return。
//   修复：用 target.closest('[data-sct-mark]') 解析最近的条目元素，
//   与 onPointerOver 的判定方式对齐；浮窗行光标改为 pointer。
// v64 优化：簇点伸长触发区扩展（浮窗↔簇点整条区域）——
//   根因：鼠标从浮窗移回轨道时先划过浮窗行（onPointerOver 对其 reset() 清掉伸长态），
//   划过桥接带时 trySnap 又因 hoverKeyRef 未变提前 return，不再触发伸长；
//   因此只有移入 8px 原始刻度内（pointerover 直接命中簇点元素）才变长。
//   修复：浮窗行不再 reset（保持当前簇点伸长）；trySnap 总是重新 scheduleBurst；
//   带内判定优先簇点——y 落在某簇点上下范围内时直接让该簇点变长。
// v65 配色：莫兰迪低饱和灰调（高级感）——全部类型色去饱和、统一明度，
//   簇点渐变混色不再花哨；用户锚点高亮蓝柔化为钢青蓝 #6e8bb8。
// v66 形态：簇点初始形态更修长——上下收窄（5px→3-4px）、左右变长（10px→16px）。
// v67 交互：簇点伸长倍率独立收小（4x→2.5x，约 40px），涟漪邻域同步收小；
//   单刻度保持原倍率；浮窗对齐改用簇点倍率。
// v68 浮窗：簇点标题简化——去掉类型构成统计，只保留「★ 簇 · N 个节点」。
// v69 浮窗：标题改为簇内构成（短名+数量，取前 3）：用户×5 · 助手×4 · 工具×3。
// v70 形态：簇点初始左右长度调回 10px；上下更细（2-3px）；伸长用回 4x（10px→约 40px）。
// v71 交互：浮窗显示时，点击浮窗↔刻度之间区域（桥接带）即跳转到当前悬浮刻度位置，
//   无需精准命中簇点刻度；具体刻度/浮窗行的精准跳转仍优先。
// v72 光标：簇点刻度/轨道不再显示手型（动态伸长+浮窗已足够表示可交互）；
//   浮窗标题显式 default；浮窗条目行保留 pointer。
// v73 反馈：鼠标移动时被选中的刻度/簇点颜色加深（brightness .72），
//   提示点击跳转的是它的位置；reset 时清除。
// v74 磁吸：trySnap 垂直不再设 60px 上限——鼠标进入交互带内总是伸长最近的
//   刻度/簇点（稀疏会话时不再"进区域没反应"）。
// v75 修复：新输入后轨迹条"进区域不伸长"——① 界面可能替换滚动容器导致观察器
//   失效/模型冻结，measure 每次重查容器 + 500ms 自愈定时校验重挂；② burst 改为
//   按 key 定位并在执行时解析当前索引，杜绝索引漂移导致 d===0 落空。
// v76 选中：pick 增加纵向命中区（元素上下各扩 6px 视为零距离）——用户簇点
//   （仅 2-3px 高）可靠选中、伸长，不再被邻近簇点按中心距离抢走。
// ============================================================================
window.__ModuleLoader__.load({
  id: "dsh-sctrk",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    const React = react;

    //#region styles
    const SCT_CSS = `
.dsh-sct{
  position:fixed;width:8px;z-index:1200;pointer-events:auto;
  touch-action:none;
}
.dsh-sctMark{
  position:absolute;right:1px;width:7px;height:1px;border-radius:0;z-index:1;
  transform-origin:right center;will-change:transform,opacity;
  transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .35s ease,filter .2s ease;
}
.dsh-sctMarkUser{
  height:2px;opacity:1 !important;
  box-shadow:0 0 5px rgba(110,139,184,.9),0 0 0 1px rgba(110,139,184,.55);
}
.dsh-sctCluster{
  position:absolute;right:1px;min-width:10px;border-radius:0;z-index:1;
  transform-origin:right center;will-change:transform,opacity;
  transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .35s ease,filter .2s ease;
}
.dsh-sctCluster:hover{opacity:1}
.dsh-sctClusterUser{
  opacity:1 !important;
  box-shadow:inset 3px 0 0 #6e8bb8,0 0 0 1px rgba(15,23,42,.3),0 0 6px rgba(110,139,184,.35);
}
.dsh-sctClusterUserAll{
  opacity:1 !important;
  box-shadow:inset 3px 0 0 #6e8bb8,0 0 0 1px rgba(15,23,42,.42),0 0 8px rgba(110,139,184,.45);
}
.dsh-sctMarkHit::after,
.dsh-sctClusterHit::after{
  content:"";position:absolute;left:-6px;right:0;top:-10px;bottom:-10px;
}
.dsh-sctBridge{
  position:absolute;pointer-events:auto;z-index:0;cursor:default;
}
.dsh-sctFloat{
  position:absolute;width:220px;z-index:10;cursor:default;
  background:linear-gradient(150deg, rgba(255,255,255,.92) 0%, rgba(243,247,252,.74) 55%, rgba(235,242,250,.62) 100%);
  backdrop-filter:blur(22px) saturate(180%);
  -webkit-backdrop-filter:blur(22px) saturate(180%);
  border:1px solid rgba(255,255,255,.65);
  border-radius:20px;
  box-shadow:
    0 12px 36px rgba(15,23,42,.22),
    0 4px 12px rgba(15,23,42,.1),
    inset 0 1px 0 rgba(255,255,255,.85),
    inset 0 0 0 .5px rgba(255,255,255,.35);
  padding:10px 8px;color:#334155;
  transition:top .18s cubic-bezier(.22,1,.36,1),right .18s cubic-bezier(.22,1,.36,1),opacity .15s ease;
  animation:dsh-sct-pop .16s ease-out;
}
.dsh-sctFloat::before{
  content:"";position:absolute;left:0;right:0;top:0;height:46%;
  background:linear-gradient(180deg, rgba(255,255,255,.5), rgba(255,255,255,0));
  border-radius:20px 20px 0 0;pointer-events:none;
}
@keyframes dsh-sct-pop{
  from{opacity:0;transform:translateX(8px)}
  to{opacity:1;transform:translateX(0)}
}
.dsh-sctFloatHead{
  padding:0 8px 7px;border-bottom:1px solid rgba(15,23,42,.09);
  margin-bottom:6px;position:relative;
}
.dsh-sctFloatTitle{
  color:#475569;font-size:12px;line-height:18px;font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  cursor:default;
}
.dsh-sctFloatRow{
  display:flex;align-items:center;gap:8px;
  padding:4px 8px;cursor:pointer;min-height:24px;border-radius:10px;position:relative;
}
.dsh-sctFloatRow:hover{background:rgba(15,23,42,.07)}
.dsh-sctFloatRow:active{background:rgba(15,23,42,.13)}
.dsh-sctFloatDot{
  width:7px;height:7px;border-radius:50%;flex:none;
  box-shadow:0 1px 2px rgba(15,23,42,.28);
}
.dsh-sctFloatText{
  flex:1;min-width:0;color:#334155;
  font-size:12px;line-height:16px;
  white-space:nowrap;text-overflow:ellipsis;overflow:hidden;
}
.dsh-sctFloatRow:hover .dsh-sctFloatText{color:#0f172a}
.dsh-sctFloatIdx{color:#94a3b8;font-size:10px;flex:none;font-variant-numeric:tabular-nums}
`;
    const SCT_TAG_ID = "dsh-sctrk/styles";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(SCT_TAG_ID) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-sctrk";
      tag.dataset.pluginCss = SCT_TAG_ID;
      tag.textContent = SCT_CSS;
      document.head.appendChild(tag);
    }
    //#endregion

    //#region constants + helpers
    const KIND_LABEL = {
      user: '用户消息',
      'assistant-step': '助手回复',
      'tool-call': '工具调用',
      command: '命令',
      'command-input': '命令输入',
      steering: '转向提示',
      compaction: '压缩记录',
      'manual-compaction': '手动压缩',
      'model-retry': '模型重试',
      'turn-error': '回合错误',
      'turn-max-tokens': '回合超限',
      'turn-tail': '回合尾部',
      context: '上下文',
      'workflow-run': '工作流运行',
      unknown: '未知节点'
    }
    // v69：浮窗标题用的短名
    const KIND_SHORT = {
      user: '用户',
      'assistant-step': '助手',
      'tool-call': '工具',
      command: '命令',
      'command-input': '命令输入',
      steering: '转向',
      compaction: '压缩',
      'manual-compaction': '压缩',
      'model-retry': '重试',
      'turn-error': '错误',
      'turn-max-tokens': '超限',
      'turn-tail': '尾部',
      context: '上下文',
      'workflow-run': '工作流',
      unknown: '未知'
    }
    const KIND_COLOR = {
      user: '#6e8bb8',
      'assistant-step': '#8fae9f',
      'tool-call': '#a29bc0',
      command: '#c0a186',
      'command-input': '#a9b2bc',
      steering: '#a9a1c6',
      compaction: '#93a2b2',
      'manual-compaction': '#93a2b2',
      'model-retry': '#c4ab8c',
      'turn-error': '#c09292',
      'turn-max-tokens': '#c09292',
      'turn-tail': '#a9b2bc',
      context: '#a9b2bc',
      'workflow-run': '#84a8ae',
      unknown: '#a9b2bc'
    }
    const MAJOR = new Set(['user', 'assistant-step', 'command', 'tool-call', 'workflow-run', 'turn-error'])
    const RANGE = 4
    const SCALE = [4, 2.4, 1.7, 1.25, 1.08]
    const CLUSTER_PX = 6
    const MAX_CHILDREN = 12
    const FLOAT_W = 220
    const FLOAT_GAP = 8
    const MARK_W = 7
    const CLUSTER_W = 10
    const SNAP_RADIUS = 60
    const SNAP_LEFT = 70

    function clusterMarks(marks, scrollHeight, trackHeight) {
      if (marks.length === 0) return []
      const pxOf = (m) => (m.top / scrollHeight) * trackHeight
      const clusters = []
      let start = 0
      for (let i = 1; i < marks.length; i++) {
        if (pxOf(marks[i]) - pxOf(marks[i - 1]) >= CLUSTER_PX) {
          clusters.push({ start, end: i - 1 })
          start = i
        }
      }
      clusters.push({ start, end: marks.length - 1 })
      return clusters.map((c) => {
        const children = marks.slice(c.start, c.end + 1)
        const first = children[0]
        const last = children[children.length - 1]
        return {
          id: 'c' + c.start + '-' + c.end,
          start: c.start,
          end: c.end,
          count: children.length,
          children,
          top: (first.top + last.top) / 2
        }
      })
    }

    function sampleChildren(children, max) {
      if (children.length <= max) return children
      const out = []
      const step = (children.length - 1) / (max - 1)
      for (let i = 0; i < max; i++) out.push(children[Math.round(i * step)])
      return out
    }

    function clusterSummary(cluster) {
      const counts = {}
      for (const m of cluster.children) {
        const label = KIND_LABEL[m.kind] || m.kind || '未知'
        counts[label] = (counts[label] || 0) + 1
      }
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, n]) => label + '×' + n)
        .join(' · ')
    }

    // v69：浮窗标题构成（短名+数量，取前 3）：用户×5 · 助手×4 · 工具×3
    function clusterTitle(cluster) {
      const counts = {}
      for (const m of cluster.children) {
        const label = KIND_SHORT[m.kind] || m.kind || '未知'
        counts[label] = (counts[label] || 0) + 1
      }
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, n]) => label + '×' + n)
        .join(' · ')
    }

    function clusterColor(cluster) {
      const counts = {}
      for (const m of cluster.children) {
        const k = m.kind || 'unknown'
        counts[k] = (counts[k] || 0) + 1
      }
      const total = cluster.children.length
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      let acc = 0
      const parts = sorted.map(([kind, n]) => {
        const from = (acc / total) * 100
        acc += n
        const to = (acc / total) * 100
        const color = KIND_COLOR[kind] || '#a8b5c6'
        return color + ' ' + from + '%,' + color + ' ' + to + '%'
      })
      if (parts.length === 0) return '#a8b5c6'
      if (parts.length === 1) return KIND_COLOR[sorted[0][0]] || '#a8b5c6'
      return 'linear-gradient(90deg,' + parts.join(',') + ')'
    }
    //#endregion

    //#region ScrollTrack component
    function ScrollTrack(props) {
      const useSessions = props.useSessions
      const currentId = useSessions((s) => s.current)
      const [model, setModel] = React.useState(null)
      const [hoverInfo, setHoverInfo] = React.useState(null)
      const [previews, setPreviews] = React.useState({})
      const trackRef = React.useRef(null)
      const lastHoverRef = React.useRef(-1)
      const burstRafRef = React.useRef(0)
      const hideTimerRef = React.useRef(null)
      const lastPosRef = React.useRef(null)
      const keepRectRef = React.useRef([])
      const hoverKeyRef = React.useRef(null)
      const marksRef = React.useRef([])
      const clustersRef = React.useRef([])

      const inKeepZone = (x, y) => {
        const rects = keepRectRef.current
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
        }
        return false
      }

      const hideNow = () => {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
        hoverKeyRef.current = null
        reset()
        setHoverInfo(null)
      }

      const cancelHide = () => {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
      }

      const scheduleHide = () => {
        if (hideTimerRef.current) return
        hideTimerRef.current = window.setTimeout(hideNow, 100)
      }

      const trySnap = (x, y) => {
        const trackEl = trackRef.current
        if (!trackEl) return false
        const marks = marksRef.current
        const clusters = clustersRef.current
        if (!marks || marks.length === 0) return false
        const r = trackEl.getBoundingClientRect()
        if (x < r.left - SNAP_LEFT || x > r.right + 4 || y < r.top || y > r.bottom) return false
        const els = trackEl.querySelectorAll('[data-sct-mark]')
        const pick = (onlyCluster) => {
          let best = null
          // v74：磁吸——垂直不设距离上限，鼠标进入交互带内总能选中最近的刻度/簇点
          let bestD = Infinity
          for (let i = 0; i < els.length; i++) {
            const el = els[i]
            if (el.dataset.child === '1') continue
            if (onlyCluster && el.dataset.cluster !== '1') continue
            const er = el.getBoundingClientRect()
            const cy = er.top + er.height / 2
            // v76：光标落在元素纵向范围（上下各扩 6px）内视为零距离——
            // 用户簇点（仅 2-3px 高）也能可靠选中，而不是总被邻近簇点抢走
            const d = y >= er.top - 6 && y <= er.bottom + 6 ? 0 : Math.abs(y - cy)
            if (d < bestD) {
              bestD = d
              best = { idx: Number(el.dataset.index), key: el.dataset.sctMark, isCluster: el.dataset.cluster === '1' }
            }
          }
          return best
        }
        // v64：优先命中簇点——y 落在某个簇点的上下范围内时直接让该簇点变长，
        // 而不是就近选到 1px 的细刻度（簇点在带内总是优先变长）。
        let best = pick(true)
        if (!best) best = pick(false)
        if (!best) return true
        // v64：不因 key 未变就提前返回——鼠标从浮窗/桥接带移回时，
        // 浮窗行 hover 会 reset 掉伸长态，这里总是重新 scheduleBurst 恢复簇点伸长。
        const keyChanged = hoverKeyRef.current !== best.key
        hoverKeyRef.current = best.key
        if (keyChanged) {
          if (best.isCluster) {
            const c = clusters.find((x) => x.id === best.key)
            if (c) {
              setHoverInfo({ kind: 'cluster', cluster: c })
              setPreviews(readPreviews(sampleChildren(c.children, MAX_CHILDREN)))
            }
          } else {
            const m = marks.find((x) => x.key === best.key)
            if (m) {
              setHoverInfo({ kind: 'mark', mark: m })
              setPreviews(readPreviews([m]))
            }
          }
        }
        scheduleBurst(best.key)
        return true
      }

      const handlePosition = (x, y) => {
        const trackEl = trackRef.current
        if (!trackEl) return
        const r = trackEl.getBoundingClientRect()
        const inBand = x >= r.left - SNAP_LEFT && x <= r.right + 4 && y >= r.top && y <= r.bottom
        if (inBand) {
          trySnap(x, y)
          cancelHide()
          return
        }
        if (inKeepZone(x, y)) {
          cancelHide()
        } else {
          scheduleHide()
        }
      }

      React.useEffect(() => {
        if (currentId === undefined) {
          setModel(null)
          return
        }
        let disposed = false
        let raf = 0
        let ro = null
        let mo = null
        let attachedEl = null
        // v75：measure 每次重新查询滚动容器——界面在输入后可能替换
        // [data-conversation-scroll] 元素，旧观察器失效会导致轨迹条冻结/消失。
        const measure = () => {
          raf = 0
          if (disposed) return
          const scrollEl = document.querySelector('[data-conversation-scroll]')
          if (!scrollEl) {
            setModel(null)
            return
          }
          const rect = scrollEl.getBoundingClientRect()
          const nodes = Array.from(scrollEl.querySelectorAll('[data-chat-flow-key]'))
          const marks = []
          for (const el of nodes) {
            const r = el.getBoundingClientRect()
            marks.push({
              key: el.getAttribute('data-chat-flow-key') || String(marks.length),
              kind: el.getAttribute('data-chat-flow-kind') || '',
              top: r.top - rect.top + scrollEl.scrollTop
            })
          }
          setModel({
            rect: { top: rect.top, height: rect.height },
            scrollTop: scrollEl.scrollTop,
            scrollHeight: scrollEl.scrollHeight,
            clientHeight: scrollEl.clientHeight,
            marks
          })
        }
        const schedule = () => { if (!raf) raf = requestAnimationFrame(measure) }
        const attach = () => {
          if (ro) ro.disconnect()
          if (mo) mo.disconnect()
          ro = mo = null
          attachedEl = document.querySelector('[data-conversation-scroll]')
          if (attachedEl) {
            ro = new ResizeObserver(schedule)
            ro.observe(attachedEl)
            mo = new MutationObserver(schedule)
            mo.observe(attachedEl, { childList: true, subtree: true })
          }
          schedule() // 无论容器是否存在都重测量（无容器时 measure 会 setModel(null)）
        }
        attach()
        // v75 自愈：定时校验观察器挂在当前容器上（容器被替换/消失则重挂+重测量）
        const healTimer = window.setInterval(() => {
          if (disposed) return
          const cur = document.querySelector('[data-conversation-scroll]')
          if (cur !== attachedEl) attach()
        }, 500)
        return () => {
          disposed = true
          if (raf) cancelAnimationFrame(raf)
          if (burstRafRef.current) cancelAnimationFrame(burstRafRef.current)
          if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
          }
          if (ro) ro.disconnect()
          if (mo) mo.disconnect()
          window.clearInterval(healTimer)
        }
      }, [currentId])

      React.useEffect(() => {
        if (hoverInfo === null) {
          keepRectRef.current = []
          return
        }
        const collectRects = () => {
          const trackEl = trackRef.current
          if (!trackEl) return
          const rects = []
          const floatEl = trackEl.querySelector('.dsh-sctFloat')
          if (floatEl) rects.push(floatEl.getBoundingClientRect())
          const bridgeEl = trackEl.querySelector('.dsh-sctBridge')
          if (bridgeEl) rects.push(bridgeEl.getBoundingClientRect())
          const marks = trackEl.querySelectorAll('[data-sct-mark]')
          for (let i = 0; i < marks.length; i++) rects.push(marks[i].getBoundingClientRect())
          keepRectRef.current = rects
        }
        collectRects()
        const intervalId = window.setInterval(collectRects, 200)
        return () => {
          window.clearInterval(intervalId)
        }
      }, [hoverInfo])

      React.useEffect(() => {
        const onMove = (e) => {
          lastPosRef.current = { x: e.clientX, y: e.clientY }
          handlePosition(e.clientX, e.clientY)
        }
        const onDown = (e) => {
          const trackEl = trackRef.current
          if (trackEl && trackEl.contains(e.target)) return
          hideNow()
        }
        document.addEventListener('pointermove', onMove, true)
        document.addEventListener('pointerdown', onDown, true)
        const intervalId = window.setInterval(() => {
          const p = lastPosRef.current
          if (!p) return
          handlePosition(p.x, p.y)
        }, 50)
        return () => {
          document.removeEventListener('pointermove', onMove, true)
          document.removeEventListener('pointerdown', onDown, true)
          window.clearInterval(intervalId)
          if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
      }, [currentId])

      if (model === null || model.marks.length === 0) return null

      const { rect, scrollHeight, marks } = model
      marksRef.current = marks
      const top = rect.top + 12
      const height = Math.max(40, rect.height - 24)
      const clusters = clusterMarks(marks, scrollHeight, height)
      clustersRef.current = clusters

      const readPreviews = (targets) => {
        const map = {}
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape : (s) => s
        for (const m of targets) {
          let text = ''
          try {
            const el = document.querySelector('[data-chat-flow-key="' + esc(m.key) + '"]')
            if (el) text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 42)
          } catch (err) { /* ignore */ }
          map[m.key] = text || (KIND_LABEL[m.kind] || m.kind || '会话节点')
        }
        return map
      }

      const scrollToRatio = (ratio) => {
        const el = document.querySelector('[data-conversation-scroll]')
        if (!el) return
        const r = Math.max(0, Math.min(1, ratio))
        el.scrollTop = r * el.scrollHeight
      }
      const jumpTo = (markTop) => {
        const el = document.querySelector('[data-conversation-scroll]')
        if (el) el.scrollTop = Math.max(0, markTop - 12)
      }

      // v75：burst 用 key 定位目标，执行时再取当前 data-index——
      // 输入后节点/簇重新聚类导致索引漂移时仍能命中，杜绝"进区域不伸长"。
      const burst = (hoverKey) => {
        const trackEl = trackRef.current
        if (!trackEl) return
        const els = Array.from(trackEl.querySelectorAll('[data-sct-mark]'))
        let hoverIdx = -1
        for (const el of els) {
          if (el.dataset.child === '1') continue
          if (el.dataset.sctMark === hoverKey) {
            hoverIdx = Number(el.dataset.index)
            break
          }
        }
        if (hoverIdx < 0) return
        for (const el of els) {
          if (el.dataset.child === '1') continue
          const idx = Number(el.dataset.index)
          const d = Math.abs(idx - hoverIdx)
          const active = d <= RANGE
          const isCluster = el.dataset.cluster === '1'
          const isUser = el.dataset.user === '1'
          let op = isUser ? 1 : (isCluster ? 0.8 : (el.dataset.major === '1' ? 0.7 : 0.5))
          if (active && !isUser) {
            const base = isCluster ? 0.8 : (el.dataset.major === '1' ? 0.7 : 0.5)
            op = Math.min(1, base + (1 - base) * Math.pow(0.55, d))
          }
          if (active && d === 0) {
            el.classList.add('dsh-sctHit')
            el.style.transform = 'scaleX(' + SCALE[0] + ') scaleY(1.6)'
            // v73：被选中的刻度颜色加深，提示点击跳转的是它的位置
            el.style.filter = 'brightness(.72)'
            el.style.zIndex = '2'
          } else {
            el.classList.remove('dsh-sctHit')
            el.style.transform = 'scaleX(' + (active ? SCALE[d] : 1) + ')'
            el.style.filter = ''
            el.style.zIndex = ''
          }
          el.style.opacity = String(op)
          el.style.transitionDelay = (d * 20) + 'ms'
        }
      }

      const reset = () => {
        const trackEl = trackRef.current
        if (!trackEl) return
        const h = lastHoverRef.current
        const els = Array.from(trackEl.querySelectorAll('[data-sct-mark]'))
        for (const el of els) {
          if (el.dataset.child === '1') continue
          const idx = Number(el.dataset.index)
          const d = h < 0 ? 0 : Math.abs(idx - h)
          const delay = h >= 0 && d <= RANGE ? (RANGE - d) * 20 : 0
          const isCluster = el.dataset.cluster === '1'
          const isUser = el.dataset.user === '1'
          el.classList.remove('dsh-sctHit')
          el.style.transform = 'scaleX(1)'
          el.style.filter = ''
          el.style.zIndex = ''
          el.style.opacity = isUser ? '1' : (isCluster ? '0.8' : (el.dataset.major === '1' ? '0.7' : '0.5'))
          el.style.transitionDelay = delay + 'ms'
        }
        lastHoverRef.current = -1
      }

      const scheduleBurst = (key) => {
        // v75：同步解析当前索引供 reset 错峰使用；burst 内部按 key 再解析一次
        const trackEl = trackRef.current
        let idx = -1
        if (trackEl) {
          const els = trackEl.querySelectorAll('[data-sct-mark]')
          for (const el of els) {
            if (el.dataset.child === '1') continue
            if (el.dataset.sctMark === key) {
              idx = Number(el.dataset.index)
              break
            }
          }
        }
        lastHoverRef.current = idx
        if (burstRafRef.current) cancelAnimationFrame(burstRafRef.current)
        burstRafRef.current = requestAnimationFrame(() => {
          burstRafRef.current = 0
          burst(key)
        })
      }

      const onPointerOver = (e) => {
        const t = e.target
        const markEl = t && t.closest ? t.closest('[data-sct-mark]') : null
        if (!markEl) return
        cancelHide()
        if (markEl.dataset.child === '1') {
          // v64：浮窗行属于当前簇点——不 reset，保持簇点伸长态，
          // 鼠标在浮窗↔簇点整条区域内移动时簇点持续变长。
          return
        }
        const key = markEl.dataset.sctMark
        if (markEl.dataset.cluster === '1') {
          const c = clustersRef.current.find((x) => x.id === key)
          if (c) {
            hoverKeyRef.current = c.id
            setHoverInfo({ kind: 'cluster', cluster: c })
            setPreviews(readPreviews(sampleChildren(c.children, MAX_CHILDREN)))
          }
        } else {
          const m = marksRef.current.find((x) => x.key === key)
          if (m) {
            hoverKeyRef.current = m.key
            setHoverInfo({ kind: 'mark', mark: m })
            setPreviews(readPreviews([m]))
          }
        }
        scheduleBurst(key)
      }

      const onPointerOut = (e) => {
        const related = e.relatedTarget
        if (related && related.closest && related.closest('[data-sct-keep]')) {
          cancelHide()
          return
        }
        scheduleHide()
      }

      const onFloatLeave = () => {
        scheduleHide()
      }

      const onPointerDown = (e) => {
        e.preventDefault()
        const trackEl = trackRef.current
        if (!trackEl) return
        const target = e.target
        // 关键：解析点击目标“最近的条目元素”，而不是直接读 target.dataset。
        // 浮窗行内部是 span（文本/圆点/序号），直接读 dataset 会漏判 → 点击没反应。
        const hit = target && target.closest ? target.closest('[data-sct-mark]') : null
        const ds = hit && hit.dataset ? hit.dataset : {}
        if (ds.cluster === '1') {
          const c = clustersRef.current.find((x) => x.id === ds.sctMark)
          if (c) {
            const mid = c.children[Math.floor(c.children.length / 2)]
            if (mid) jumpTo(mid.top)
          }
          return
        }
        if (ds.child === '1') {
          const mark = marksRef.current.find((m) => m.key === ds.sctMark)
          if (mark) jumpTo(mark.top)
          return
        }
        if (ds.sctMark !== undefined) {
          const mark = marksRef.current.find((m) => m.key === ds.sctMark)
          if (mark) jumpTo(mark.top)
          return
        }
        // v71：浮窗显示时，点击浮窗↔刻度之间的区域（桥接带/浮窗非行区域）
        // 直接跳转到当前悬浮刻度的位置——无需精准命中簇点刻度。
        if (hoverInfo !== null) {
          if (hoverInfo.kind === 'mark') {
            jumpTo(hoverInfo.mark.top)
          } else {
            const mid = hoverInfo.cluster.children[Math.floor(hoverInfo.cluster.children.length / 2)]
            if (mid) jumpTo(mid.top)
          }
          return
        }
        const r = trackEl.getBoundingClientRect()
        if (e.clientX < r.right - 8 || e.clientX > r.right) return
        scrollToRatio((e.clientY - r.top) / r.height)
        const move = (ev) => {
          const rr = trackEl.getBoundingClientRect()
          scrollToRatio((ev.clientY - rr.top) / rr.height)
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }

      const children = []
      let renderIndex = 0
      for (const c of clusters) {
        if (c.count === 1) {
          const m = c.children[0]
          const isUser = m.kind === 'user'
          children.push(React.createElement('div', {
            key: m.key,
            className: 'dsh-sctMark' + (isUser ? ' dsh-sctMarkUser' : '') + (MAJOR.has(m.kind) ? ' dsh-sctMarkMajor' : ''),
            'data-sct-mark': m.key,
            'data-sct-keep': '1',
            'data-index': String(renderIndex++),
            'data-major': MAJOR.has(m.kind) ? '1' : '0',
            'data-user': isUser ? '1' : '0',
            style: { top: (m.top / scrollHeight) * 100 + '%', background: KIND_COLOR[m.kind] || '#a8b5c6' }
          }))
          continue
        }
        const hasUser = c.children.some((m) => m.kind === 'user')
        const allUser = hasUser && c.children.every((m) => m.kind === 'user')
        const clusterHeight = Math.min(3, c.count)
        let cls = 'dsh-sctCluster'
        if (allUser) cls += ' dsh-sctClusterUser dsh-sctClusterUserAll'
        else if (hasUser) cls += ' dsh-sctClusterUser'
        children.push(React.createElement('div', {
          key: c.id,
          className: cls,
          'data-sct-mark': c.id,
          'data-sct-keep': '1',
          'data-index': String(renderIndex++),
          'data-major': '1',
          'data-cluster': '1',
          'data-user': hasUser ? '1' : '0',
          style: {
            top: ((c.top / scrollHeight) * 100 - clusterHeight / 2) + '%',
            height: clusterHeight,
            background: clusterColor(c)
          }
        }))
      }
      if (hoverInfo !== null) {
        const targets = hoverInfo.kind === 'mark'
          ? [hoverInfo.mark]
          : sampleChildren(hoverInfo.cluster.children, MAX_CHILDREN)
        const anchorTop = hoverInfo.kind === 'mark' ? hoverInfo.mark.top : hoverInfo.cluster.top
        const estH = targets.length * 32 + 46
        const anchorPx = (anchorTop / scrollHeight) * height
        const floatTopPx = Math.max(4, Math.min(height - estH - 4, anchorPx - estH / 2))
        const baseW = hoverInfo.kind === 'mark' ? MARK_W : CLUSTER_W
        const stretched = baseW * SCALE[0]
        const right = 1 + stretched + FLOAT_GAP
        const maxRight = Math.max(0, (window.innerWidth - 8) - FLOAT_W - 8)
        const floatRightPx = Math.min(right, maxRight)
        let titleText = ''
        if (hoverInfo.kind === 'mark') {
          titleText = KIND_LABEL[hoverInfo.mark.kind] || hoverInfo.mark.kind || '会话节点'
        } else {
          const c = hoverInfo.cluster
          // v69：标题显示簇内构成（短名+数量），不再显示「★ 簇 · N 个节点」
          titleText = clusterTitle(c)
        }
        children.push(React.createElement('div', {
          key: 'bridge',
          className: 'dsh-sctBridge',
          'data-sct-keep': '1',
          style: {
            top: (floatTopPx - 4) + 'px',
            right: '8px',
            width: Math.max(0, floatRightPx - 8) + 'px',
            height: (estH + 8) + 'px'
          }
        }))
        const floatChildren = []
        floatChildren.push(React.createElement('div', {
          key: 'head',
          className: 'dsh-sctFloatHead'
        }, React.createElement('div', {
          key: 'title',
          className: 'dsh-sctFloatTitle'
        }, titleText)))
        for (let i = 0; i < targets.length; i++) {
          const m = targets[i]
          floatChildren.push(React.createElement('div', {
            key: m.key,
            className: 'dsh-sctFloatRow',
            'data-sct-mark': m.key,
            'data-sct-keep': '1',
            'data-child': '1',
            'data-major': MAJOR.has(m.kind) ? '1' : '0'
          }, [
            React.createElement('span', {
              key: 'dot',
              className: 'dsh-sctFloatDot',
              style: { background: KIND_COLOR[m.kind] || '#a8b5c6' }
            }),
            React.createElement('span', {
              key: 'txt',
              className: 'dsh-sctFloatText'
            }, previews[m.key] || KIND_LABEL[m.kind] || m.kind || '会话节点'),
            React.createElement('span', {
              key: 'idx',
              className: 'dsh-sctFloatIdx'
            }, String(targets.length > 1 ? i + 1 : ''))
          ]))
        }
        children.push(React.createElement('div', {
          key: 'float',
          className: 'dsh-sctFloat',
          'data-sct-keep': '1',
          onPointerLeave: onFloatLeave,
          style: { top: floatTopPx + 'px', right: floatRightPx + 'px' }
        }, floatChildren))
      }
      return React.createElement('div', {
        ref: trackRef,
        className: 'dsh-sct',
        style: { top, height, right: 8 },
        onPointerDown,
        onPointerOver,
        onPointerOut
      }, children)
    }
    //#endregion

    //#region plugin entry
    /** Required services: the slot registry (shell.overlay contribution). */
    const inject = ["slots"];
    /**
     * Client plugin body: register the scroll track as a shell.overlay
     * occupant (additive, click-through until hovered).
     * @param ctx - client root context.
     */
    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'chat-scroll-track', order: 200 },
        (props) => React.createElement(ScrollTrack, props)
      ))
    }
    //#endregion

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
