// 大洗海浜公園の現地天気＋海象データを Open-Meteo から取得し、
// 観光客向けの「実行可能なアドバイス」を組み立てる共有ロジック。
// サーバー（ビルド時）とクライアント（表示更新時）の両方から利用する。

export interface TideEvent {
  type: 'high' | 'low';
  hour: number;
  level: number;
}

export interface WeatherModel {
  current: {
    code: number;
    temp: number;
    feels: number;
    humidity: number;
    windKmh: number;
    windDir: number;
    precip: number;
  };
  today: {
    code: number;
    tempMax: number;
    tempMin: number;
    pop: number;
    uv: number;
    windKmhMax: number;
  };
  forecast: { dow: string; code: number; max: number; min: number; pop: number }[];
  marine: { waveMax: number; seaTempMean: number; tide: number[] };
  tideEvents: TideEvent[];
  lowTideHour: number | null;
}

export interface Advice {
  travel: string[];
  activities: string[];
  items: string[];
  risks: string[];
  marineNote: string;
}

export const WMO_LABELS: Record<number, string> = {
  0: '晴れ', 1: '概ね晴れ', 2: '一部曇り', 3: '曇り',
  45: '霧', 48: '霧氷',
  51: '弱い霧雨', 53: '霧雨', 55: '強い霧雨', 56: '着氷性霧雨', 57: '着氷性霧雨',
  61: '弱い雨', 63: '雨', 65: '強い雨', 66: '着氷性雨', 67: '着氷性雨',
  71: '弱い雪', 73: '雪', 75: '強い雪', 77: '霧雪',
  80: 'にわか雨', 81: 'にわか雨', 82: '強いにわか雨',
  85: '雪のにわか', 86: '強い雪のにわか',
  95: '雷雨', 96: '雹を伴う雷雨', 99: '強い雹を伴う雷雨',
};

export function groupOf(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloud';
}

// 風速(km/h) →  Beaufort 風力階級
export function beaufort(kmh: number): number {
  const s = kmh;
  if (s < 1) return 0;
  if (s < 6) return 1;
  if (s < 12) return 2;
  if (s < 20) return 3;
  if (s < 29) return 4;
  if (s < 39) return 5;
  if (s < 50) return 6;
  if (s < 62) return 7;
  if (s < 75) return 8;
  return 9;
}

export function windDirLabel(deg: number): string {
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return dirs[Math.round(deg / 45) % 8];
}

const LAT = 36.3044132;
const LON = 140.5664618;
const TZ = 'Asia/Tokyo';

async function getJson(url: string, timeoutMs = 4000): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchWeatherData(): Promise<WeatherModel | null> {
  const wUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=7`;

  const mUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}` +
    `&hourly=wave_height,sea_surface_temperature,sea_level_height_msl` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=1`;

  const [w, m] = await Promise.all([getJson(wUrl), getJson(mUrl)]);
  if (!w || !w.current || !w.daily) return null;

  const d = w.daily as any;
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  const forecast = (d.time as string[]).map((iso: string, i: number) => ({
    dow: i === 0 ? '今日' : WEEK[new Date(iso + 'T00:00:00').getDay()],
    code: Number(d.weather_code[i]),
    max: Math.round(Number(d.temperature_2m_max[i])),
    min: Math.round(Number(d.temperature_2m_min[i])),
    pop: Number(d.precipitation_probability_max[i] ?? 0),
  }));

  let tide: number[] = [];
  let lowTideHour: number | null = null;
  let waveMax = 0;
  let seaTempMean = NaN;
  let events: TideEvent[] = [];
  if (m && m.hourly) {
    const h = m.hourly as any;
    tide = (h.sea_level_height_msl as number[]) ?? [];
    const waves = (h.wave_height as number[]) ?? [];
    const temps = (h.sea_surface_temperature as number[]) ?? [];
    waveMax = waves.length ? Math.max(...waves) : 0;
    seaTempMean = temps.length ? temps.reduce((a: number, b: number) => a + b, 0) / temps.length : NaN;
    events = computeTideEvents(tide);
    if (events.length) {
      const lows = events.filter((e) => e.type === 'low');
      const ref = lows.length ? lows : events;
      lowTideHour = ref.reduce((a, b) => (b.level < a.level ? b : a)).hour;
    }
  }

  return {
    current: {
      code: Number(w.current.weather_code ?? 3),
      temp: Math.round(Number(w.current.temperature_2m ?? 0)),
      feels: Math.round(Number(w.current.apparent_temperature ?? w.current.temperature_2m ?? 0)),
      humidity: Math.round(Number(w.current.relative_humidity_2m ?? 0)),
      windKmh: Number(w.current.wind_speed_10m ?? 0),
      windDir: Number(w.current.wind_direction_10m ?? 0),
      precip: Number(w.current.precipitation ?? 0),
    },
    today: {
      code: Number(d.weather_code[0] ?? 3),
      tempMax: Math.round(Number(d.temperature_2m_max[0])),
      tempMin: Math.round(Number(d.temperature_2m_min[0])),
      pop: Number(d.precipitation_probability_max[0] ?? 0),
      uv: Number(d.uv_index_max?.[0] ?? 0),
      windKmhMax: Number(d.wind_speed_10m_max?.[0] ?? 0),
    },
    forecast,
    marine: {
      waveMax: Number(waveMax.toFixed(1)),
      seaTempMean: Number(seaTempMean.toFixed(1)),
      tide,
    },
    tideEvents: events,
    lowTideHour,
  };
}

// 24時間の潮位（海面高）から満潮・干潮の極値を検出する（小さな起伏は無視）。
function computeTideEvents(tide: number[]): TideEvent[] {
  const events: TideEvent[] = [];
  const n = tide.length;
  if (n < 3) return events;
  const range = Math.max(...tide) - Math.min(...tide);
  const prom = Math.max(0.12, range * 0.18);
  const isHigh = (i: number) =>
    tide[i] >= tide[i - 1] && tide[i] >= tide[i + 1] && tide[i] - Math.min(tide[i - 1], tide[i + 1]) >= prom;
  const isLow = (i: number) =>
    tide[i] <= tide[i - 1] && tide[i] <= tide[i + 1] && Math.max(tide[i - 1], tide[i + 1]) - tide[i] >= prom;
  if (tide[0] > tide[1] && tide[0] - tide[1] >= prom) events.push({ type: 'high', hour: 0, level: tide[0] });
  if (tide[0] < tide[1] && tide[1] - tide[0] >= prom) events.push({ type: 'low', hour: 0, level: tide[0] });
  for (let i = 1; i < n - 1; i++) {
    if (isHigh(i)) events.push({ type: 'high', hour: i, level: tide[i] });
    else if (isLow(i)) events.push({ type: 'low', hour: i, level: tide[i] });
  }
  if (tide[n - 1] > tide[n - 2] && tide[n - 1] - tide[n - 2] >= prom)
    events.push({ type: 'high', hour: n - 1, level: tide[n - 1] });
  if (tide[n - 1] < tide[n - 2] && tide[n - 2] - tide[n - 1] >= prom)
    events.push({ type: 'low', hour: n - 1, level: tide[n - 1] });
  return events;
}

// 一日の潮位変化を折れ線で描く SVG を生成（満潮=琥珀色、干潮=青色）。
export function buildTideSvg(m: WeatherModel): string {
  const tide = m.marine.tide;
  if (!tide.length) return '';
  const W = 320;
  const H = 150;
  const padL = 10;
  const padR = 10;
  const padT = 22;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const min = Math.min(...tide);
  const max = Math.max(...tide);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / (tide.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - min) / span) * plotH;
  const line = tide.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `M ${x(0).toFixed(1)},${y(tide[0]).toFixed(1)} ${tide
    .map((v, i) => `L ${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')} L ${x(tide.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L ${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
  const markers = m.tideEvents
    .map((e) => {
      const cx = x(e.hour).toFixed(1);
      const cy = y(e.level).toFixed(1);
      const color = e.type === 'high' ? '#e0a93b' : '#5aa9c4';
      const label = (e.type === 'high' ? '満 ' : '干 ') + e.hour + '時';
      const ty = e.type === 'high' ? (Number(cy) - 9).toFixed(1) : (Number(cy) + 14).toFixed(1);
      return `<circle cx="${cx}" cy="${cy}" r="3" fill="${color}" stroke="#fff" stroke-width="1"/>
        <text x="${cx}" y="${ty}" text-anchor="middle" font-size="8" fill="${color}" font-weight="700">${label}</text>`;
    })
    .join('');
  const ticks = [0, 6, 12, 18, 23]
    .map((h) => {
      const hx = x(h).toFixed(1);
      const lbl = h === 23 ? '24' : String(h);
      return `<line x1="${hx}" y1="${padT}" x2="${hx}" y2="${padT + plotH}" stroke="#dce8ea" stroke-width="0.5"/>
        <text x="${hx}" y="${H - 8}" text-anchor="middle" font-size="8" fill="#8a9a9d">${lbl}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="tide-svg" aria-hidden="true">
    <path d="${area}" fill="rgba(90,169,196,0.12)"/>
    <path d="${line}" fill="none" stroke="#15708a" stroke-width="1.6"/>
    ${markers}
    ${ticks}
  </svg>`;
}

// 天気データから、観光客が「何をすべきか」を直接導き出すアドバイスを組み立てる。
export function buildAdvice(m: WeatherModel): Advice {
  const t = m.today;
  const travel: string[] = [];
  const activities: string[] = [];
  const items: string[] = [];
  const risks: string[] = [];

  // 降水
  if (t.pop >= 60) {
    travel.push('降水確率が高めです。折りたたみ傘か雨具があると安心です。');
    activities.push('室内施設を中心に回るのがおすすめ。海辺の散策は様子を見て延期も検討を。');
    items.push('雨具（傘・レインコート）');
  }
  const rainLight = [51, 53, 55, 56, 57, 61, 63, 80, 81].includes(t.code);
  const rainHeavy = [65, 66, 67, 82].includes(t.code);
  const thunder = t.code >= 95;
  if (rainLight) {
    travel.push('軽い雨、足元が滑りやすいので歩きやすい靴で。');
    activities.push('屋外の催しは楽しみにくい時間帯です。');
    if (!items.includes('折りたたみ傘')) items.push('折りたたみ傘');
  }
  if (rainHeavy) {
    risks.push('雨が強く、谷や低い場所は避けて。');
    activities.push('屋外の遊びは控え、遊覧船等は運休の可能性があります。');
    items.push('レインコート（風が強い日は長傘より雨具を）');
  }
  if (thunder) {
    risks.push('雷に注意。山への登頂、海辺での水遊び、木の下での雨宿りは避けて。');
    activities.push('水上のアクティビティは休止の可能性が高いです。');
  }

  // 高温・紫外線
  if (t.tempMax >= 32) {
    travel.push('気温が高いので、正午前後の外出は控えめに。');
    activities.push('屋外の滞在は短めに、日陰や屋内でこまめに休憩を。');
    items.push('日焼け止め、十分な飲み物、暑さ対策グッズ');
  }
  if (t.uv >= 5) {
    travel.push('紫外線が強いので日差し対策を。');
    items.push('日焼け止め、サングラス、帽子');
  }

  // 低温
  if (t.tempMax - t.tempMin >= 8) {
    travel.push('昼夜の気温差が大きいので、羽織るものがあると調節しやすいです。');
  }
  if (t.tempMax <= 10) {
    travel.push('気温が低め、防寒をしっかりと。');
    items.push('厚手の上着、マフラー');
  }

  // 風（Beaufort）
  const b = beaufort(t.windKmhMax);
  if (b >= 5 && b <= 6) {
    travel.push('風がやや強めです。');
    activities.push('海辺の遊覧船や一部の屋外施設は運航・運転を見合わせる場合があります。');
    items.push('帽子は飛びやすいのでひも付きが安心。広がる服装は避えて。');
  }
  if (b >= 7) {
    risks.push('強風のため、看板や海辺の岩場から離れて。');
    activities.push('海上のアクティビティは休止の可能性が高いです。');
  }

  // 晴・曇
  if (t.code === 0 || t.code === 1) {
    travel.push('天気は良く、屋外に出かけやすい日です。');
    activities.push('朝日や夕焼けの景色もおすすめ。');
    if (!items.some((i) => i.includes('日焼け'))) items.push('日焼け対策を忘れずに');
  } else if (t.code === 2 || t.code === 3) {
    travel.push('光が柔らかく、写真撮影に向いた日です。');
    activities.push('直射日光がなく、長時間の屋外散策に適しています。');
  }

  // 霧
  if (t.code === 45 || t.code === 48) {
    risks.push('視界が悪く、船やフライトが遅れることがあります。');
    activities.push('海や山の展望には向かないかもしれません。');
    items.push('マスク');
  }

  // 海辺（海象）
  const wave = m.marine.waveMax;
  let marineNote = '';
  if (wave >= 2) {
    marineNote = '波が高く、磯際や岩場への立ち入りは危険です。遊泳や磯釣りは控えましょう。';
    activities.push('波が高く、磯際への立ち入りは危険です。');
  } else if (wave >= 1) {
    marineNote = '波は少しあります。岩場や防波堤では足元に注意を。';
  } else {
    marineNote = '波は穏やか。潮だまり観察や磯歩きに適した日です。';
  }
  if (!Number.isNaN(m.marine.seaTempMean) && m.marine.seaTempMean <= 18) {
    marineNote += '海水は冷たいので、長時間の水遊びは避けましょう。';
  }

  return { travel, activities, items, risks, marineNote };
}
