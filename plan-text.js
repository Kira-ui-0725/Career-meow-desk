/* Browser-local task extraction. No network request or model call. */
(() => {
  "use strict";

  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

  function numberOf(value) {
    if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if (value === "十") return 10;
    if (value.includes("十")) {
      const [left, right] = value.split("十");
      return (left ? digits[left] : 1) * 10 + (right ? digits[right] : 0);
    }
    return digits[value];
  }

  function categoryOf(title) {
    if (/运动|跑步|慢跑|健身|散步|瑜伽|游泳/.test(title)) return "运动";
    if (/休息|吃饭|午休|睡觉/.test(title)) return "休息";
    if (/学习|课程|复盘|项目|英语|阅读/.test(title)) return "学习";
    if (/面试|笔试|刷题|面经/.test(title)) return "笔面准备";
    if (/投递|简历|岗位/.test(title)) return "投递";
    return "其他";
  }

  function parse(text) {
    return String(text ?? "")
      .replace(/\r/g, "")
      .split(/[，,。；;、\n]+/)
      .map((part) => part.trim().replace(/^(?:我今天(?:需要|要)?|今天(?:需要|要)?|还要|然后|接着|再)\s*/, "").trim())
      .filter(Boolean)
      .map((part) => {
        const match = part.match(/[（(]?\s*([零〇一二两三四五六七八九十\d]+(?:\.\d+)?)\s*(小时|分钟|分)\s*[）)]?\s*$/);
        const quantity = match ? numberOf(match[1]) : undefined;
        const duration = match && Number.isFinite(quantity) ? Math.round(quantity * (match[2] === "小时" ? 60 : 1)) : 45;
        const title = (match ? part.slice(0, match.index) : part).trim().replace(/[（(\s]+$/, "");
        return { title: title.slice(0, 100), duration, category: categoryOf(title), estimated: !match };
      });
  }

  function autoPlace(items, occupied = [], preferredStart = 9 * 60) {
    const slots = occupied.map(({ start, end }) => ({ start, end }));
    const placed = [];
    let cursor = Math.max(0, Math.min(1410, Math.ceil(preferredStart / 30) * 30));
    for (const item of items) {
      const duration = Number(item.duration);
      let match = null;
      for (const [from, until] of [[cursor, 1440], [540, cursor], [0, 540]]) {
        for (let start = Math.ceil(from / 30) * 30; start < until; start += 30) {
          const end = start + duration;
          if (end > 1440 || slots.some((slot) => start < slot.end && slot.start < end)) continue;
          match = { start, end };
          break;
        }
        if (match) break;
      }
      placed.push(match);
      if (match) { slots.push(match); cursor = Math.ceil(match.end / 30) * 30; }
    }
    return placed;
  }

  function reflowAt(entries, fixed, targetId, start, dayEnd = 1440) {
    const target = entries.find((entry) => entry.id === targetId);
    if (!target) return null;
    const duration = target.end - target.start;
    if (start < 0 || start + duration > dayEnd) return null;
    const overlaps = (left, right) => left.start < right.end && right.start < left.end;
    const targetSlot = { start, end: start + duration };
    if (fixed.some((slot) => overlaps(slot, targetSlot))) return null;
    const occupied = [...fixed, targetSlot];
    const placements = new Map([[targetId, targetSlot]]);
    for (const entry of entries.filter((item) => item.id !== targetId).sort((a, b) => a.start - b.start)) {
      let nextStart = entry.start;
      while (true) {
        const slot = { start: nextStart, end: nextStart + entry.end - entry.start };
        if (slot.end > dayEnd) return null;
        const conflicts = occupied.filter((other) => overlaps(other, slot));
        if (!conflicts.length) { placements.set(entry.id, slot); occupied.push(slot); break; }
        nextStart = Math.max(...conflicts.map((other) => other.end));
      }
    }
    return placements;
  }

  const api = { parse, categoryOf, autoPlace, reflowAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PlanText = api;
})();
