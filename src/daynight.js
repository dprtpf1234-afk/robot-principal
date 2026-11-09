// 시간대에 따른 밝기 (기기 시계 기준)
// 새벽 06:00~07:30, 낮 07:30~17:00, 노을 17:00~18:30, 밤 18:30~06:00
const DayNight = (() => {
  let forced = null;

  function phase(d) {
    if (forced) return forced;
    d = d || new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 6 && h < 7.5) return 'dawn';
    if (h >= 7.5 && h < 17) return 'day';
    if (h >= 17 && h < 18.5) return 'sunset';
    return 'night';
  }

  const LABEL = { dawn: '새벽', day: '낮', sunset: '노을', night: '밤' };

  // 시험용: DayNight.force('night') / DayNight.force(null)
  function force(p) { forced = p || null; }

  return { phase, force, label: p => LABEL[p || phase()] };
})();
