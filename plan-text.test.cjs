const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, autoPlace, reflowAt } = require("./plan-text.js");

test("splits the user's sample into editable tasks and reads Chinese durations", () => {
  const items = parse("投递简历，学习一门课程（两小时），完成当前进度的面试，慢跑1小时。英语学习一小时。");
  assert.deepEqual(items.map((item) => item.title), ["投递简历", "学习一门课程", "完成当前进度的面试", "慢跑", "英语学习"]);
  assert.deepEqual(items.map((item) => item.duration), [45, 120, 45, 60, 60]);
  assert.equal(items[1].category, "学习");
  assert.equal(items[4].category, "学习");
  assert.equal(items[3].category, "运动");
  assert.equal(items[0].estimated, true);
});

test("local tasks enter free timetable slots before manual adjustment", () => {
  const items = [{ duration: 60 }, { duration: 45 }, { duration: 60 }];
  assert.deepEqual(autoPlace(items, [{ start: 600, end: 660 }], 540), [
    { start: 540, end: 600 },
    { start: 660, end: 705 },
    { start: 720, end: 780 }
  ]);
  assert.deepEqual(autoPlace([{ duration: 240 }], [{ start: 0, end: 1400 }], 540), [null]);
});

test("an hour ending at 24:00 fits on the selected day", () => {
  assert.deepEqual(autoPlace([{ duration: 60 }], [{ start: 0, end: 1380 }], 1380), [{ start: 1380, end: 1440 }]);
  assert.deepEqual(autoPlace([{ duration: 60 }], [{ start: 0, end: 1410 }], 1410), [null]);
});

test("dragging into occupied time shifts flexible tasks in order", () => {
  const entries = [
    { id: "dragged", start: 840, end: 900 },
    { id: "first", start: 540, end: 600 },
    { id: "second", start: 600, end: 660 }
  ];
  const placed = reflowAt(entries, [], "dragged", 540);
  assert.deepEqual([...placed], [
    ["dragged", { start: 540, end: 600 }],
    ["first", { start: 600, end: 660 }],
    ["second", { start: 660, end: 720 }]
  ]);
});

test("fixed events stay in place and a failed reflow changes nothing", () => {
  const entries = [{ id: "dragged", start: 1200, end: 1260 }, { id: "other", start: 1380, end: 1440 }];
  assert.equal(reflowAt(entries, [{ start: 1320, end: 1380 }], "dragged", 1320), null);
  assert.equal(reflowAt(entries, [], "dragged", 1380), null);
  assert.deepEqual(entries, [{ id: "dragged", start: 1200, end: 1260 }, { id: "other", start: 1380, end: 1440 }]);
});

test("shifted tasks skip fixed events without moving them", () => {
  const placed = reflowAt(
    [{ id: "dragged", start: 840, end: 900 }, { id: "other", start: 540, end: 600 }],
    [{ start: 600, end: 660 }],
    "dragged",
    540
  );
  assert.deepEqual(placed.get("other"), { start: 660, end: 720 });
});
